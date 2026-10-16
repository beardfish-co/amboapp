// GET /api/magisterium/prefetch
//
// Called by Vercel cron every Monday at 06:00 UTC to pre-warm the
// magisterium_cache for the coming Sunday. This means the first priest
// who opens the Gospel on Sunday gets the cached response instantly,
// rather than waiting ~10s for the Magisterium API.
//
// Auth: protected by CRON_SECRET env var. Vercel cron sends:
//   Authorization: Bearer {CRON_SECRET}
//
// Requires: CRON_SECRET, MAGISTERIUM_API_KEY, SUPABASE_SERVICE_ROLE_KEY
// in Vercel environment variables.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { queryMagisterium } from "@/lib/magisterium";

function nextSundaysCompact(count: number): string[] {
  const now = new Date();
  const daysUntilSunday = ((7 - now.getUTCDay()) % 7) || 7;
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const sunday = new Date(now);
    sunday.setUTCDate(now.getUTCDate() + daysUntilSunday + i * 7);
    const y = sunday.getUTCFullYear();
    const m = String(sunday.getUTCMonth() + 1).padStart(2, "0");
    const d = String(sunday.getUTCDate()).padStart(2, "0");
    dates.push(`${y}${m}${d}`);
  }
  return dates;
}

export async function GET(req: NextRequest) {
  // Validate cron secret
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dates = nextSundaysCompact(2); // this Sunday + next Sunday
  const supabase = createAdminClient();
  const apiKey = process.env.MAGISTERIUM_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "MAGISTERIUM_API_KEY not set" }, { status: 500 });
  }

  interface ReadingsPayload {
    dayName: string;
    readings: Array<{ id: string; reference: string }>;
  }

  const results: Array<{ date: string; status: string; gospel_ref?: string }> = [];

  for (const date of dates) {
    // Skip if already cached
    const { data: existing } = await supabase
      .from("magisterium_cache")
      .select("date")
      .eq("date", date)
      .maybeSingle();

    if (existing) {
      results.push({ date, status: "already_cached" });
      continue;
    }

    // Fetch Gospel reference
    const readingsUrl = new URL(`/api/readings?date=${date}`, req.url);
    const readingsRes = await fetch(readingsUrl.toString());

    if (!readingsRes.ok) {
      results.push({ date, status: "readings_unavailable" });
      continue;
    }

    const readings: ReadingsPayload = await readingsRes.json();
    const gospel = readings.readings.find((r) => r.id === "gospel");

    if (!gospel?.reference) {
      results.push({ date, status: "gospel_not_found" });
      continue;
    }

    // Query Magisterium AI (shared prompt in lib/magisterium.ts)
    const result = await queryMagisterium(gospel.reference, readings.dayName, apiKey);
    if (!result.ok) {
      results.push({ date, status: `magisterium_error_${result.status}` });
      continue;
    }

    const { error: insertErr } = await supabase.from("magisterium_cache").insert({
      date,
      gospel_ref: gospel.reference,
      day_name: readings.dayName,
      content: result.content,
      content_raw: result.contentRaw,
      citations: result.citations,
    });

    if (insertErr && insertErr.code !== "23505") {
      console.error(`[magisterium/prefetch] insert error for ${date}:`, insertErr);
      results.push({ date, status: "cache_insert_failed" });
      continue;
    }

    console.log(`[magisterium/prefetch] Cached ${gospel.reference} for ${date}`);
    results.push({ date, status: "prefetched", gospel_ref: gospel.reference });
  }

  return NextResponse.json({ results });
}
