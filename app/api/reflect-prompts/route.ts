// GET /api/reflect-prompts?date=YYYY-MM-DD
//
// Returns AI-generated reflective prompts for the given Sunday. The prompts
// are shared across every priest preparing for the same day — one generation
// per day, cached in the `day_prompts` table.
//
// Flow:
//   1. Look up cache (day_prompts WHERE sunday_date = ?)
//   2. If present: return immediately.
//   3. Else: load readings (live from Universalis), run generator + evaluator,
//      insert into cache (ignoring duplicate-key errors from races), return.
//
// Response shape:
//   {
//     prompts: { r1: [...], ps: [...], r2: [...], gospel: [...] },
//     cached: boolean,         // true if served from day_prompts
//     usedFallback: boolean    // true if the AI path failed and we fell back
//   }
//
// Each prompt object: { prompt, basis, mood, pressure }.
//
// Error handling:
//   400 — missing/invalid date param
//   404 — readings not yet published for this date (passes through from Universalis)
//   500 — unexpected server error
//
// Auth: requires an authenticated user. Prompts are not sensitive per se, but
// the table is RLS-scoped to authenticated users so only logged-in priests
// can request generation (which costs tokens).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateDayPrompts,
  type PromptReading,
  type PromptSet,
} from "@/lib/reflect-prompts";

interface ReadingsApiResponse {
  date: string;
  number: number;
  dayName: string;
  readings: PromptReading[];
}

function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

function validateIsoDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function fetchReadings(req: NextRequest, isoDate: string): Promise<ReadingsApiResponse | { error: string; status: number }> {
  const compact = isoToCompact(isoDate);
  const url = new URL(`/api/readings?date=${compact}`, req.url);
  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) {
    return { error: `readings fetch ${resp.status}`, status: resp.status };
  }
  const json = (await resp.json()) as ReadingsApiResponse;
  if (!json.readings || json.readings.length === 0) {
    return { error: "readings empty", status: 404 };
  }
  return json;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isoDate = searchParams.get("date");

  if (!validateIsoDate(isoDate)) {
    return NextResponse.json(
      { error: "missing or invalid `date` (expected YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // 1. Cache lookup.
  const { data: cached, error: cacheErr } = await supabase
    .from("day_prompts")
    .select("prompts")
    .eq("sunday_date", isoDate)
    .maybeSingle();

  if (cacheErr) {
    console.error("[reflect-prompts] cache lookup error:", cacheErr);
    // Non-fatal — fall through to generate.
  }

  if (cached?.prompts) {
    return NextResponse.json({
      prompts: cached.prompts as PromptSet,
      cached: true,
      usedFallback: false,
    });
  }

  // 2. Fetch readings.
  const readingsResult = await fetchReadings(req, isoDate);
  if ("error" in readingsResult) {
    return NextResponse.json(
      { error: readingsResult.error },
      { status: readingsResult.status },
    );
  }

  // Keep only the standard liturgical slots. Weekday Masses have 3 (r1, ps,
  // gospel — no r2); Sunday Masses have 4. Require at least gospel + one other.
  const standardSlots = new Set(["r1", "ps", "r2", "gospel"]);
  const filtered = readingsResult.readings.filter((r) => standardSlots.has(r.id));
  if (filtered.length < 2) {
    return NextResponse.json(
      { error: "readings missing required slots" },
      { status: 422 },
    );
  }

  // 3. Generate + evaluate.
  const result = await generateDayPrompts(filtered);

  // 4. Persist using admin client — insert is a shared operation and the
  //    regular user-scoped client may lack auth context in the serverless env.
  const admin = createAdminClient();
  const { error: insertErr } = await admin.from("day_prompts").insert({
    sunday_date: isoDate, // column name is historical; stores any liturgical date
    prompts: result.prompts,
    generator_model: result.generatorModel,
    evaluator_verdict: result.verdict,
  });

  if (insertErr && insertErr.code !== "23505") {
    // 23505 = unique_violation — expected under race, safe to ignore.
    console.error("[reflect-prompts] insert error:", insertErr);
    // Still return the generated prompts; the next request will re-generate.
  }

  return NextResponse.json({
    prompts: result.prompts,
    cached: false,
    usedFallback: result.usedFallback,
  });
}
