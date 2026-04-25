// GET /api/magisterium?date=YYYYMMDD
//
// Returns magisterial teaching relevant to the Sunday Gospel, sourced from
// the Magisterium AI API. Responses are cached in Supabase — one generation
// per liturgical day, shared across all priests.
//
// Flow:
//   1. Check magisterium_cache WHERE date = ?
//   2. If present: return immediately (cached: true).
//   3. Else: fetch Gospel reference from readings API, query Magisterium AI,
//      store raw response in cache, return.
//
// Response shape:
//   { content: string; cached: boolean }
//
// Error handling:
//   400 — missing or invalid date param
//   500 — upstream API failure
//
// Auth: requires an authenticated user (RLS enforced on magisterium_cache).
//
// Attribution: Magisterium API Terms §4.5 requires "Powered by Magisterium AI"
// in any UI that surfaces this data. See ReflectView.tsx.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface CachedRow {
  content: string;
}

const MAGISTERIUM_API_URL =
  "https://www.magisterium.com/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are a theological reference assistant for Catholic priests preparing a homily.
Given a Gospel passage, provide 3 to 4 citations from official Church documents that illuminate the 
central themes of the passage for preaching.

Source priority — follow this order strictly:
1. Catechism of the Catholic Church (1992) — always try to include at least 2 CCC citations
2. Vatican II documents (1962–1965): Dei Verbum, Lumen Gentium, Gaudium et Spes, Sacrosanctum Concilium, etc.
3. Post-conciliar papal documents: encyclicals, apostolic exhortations (e.g. Evangelii Gaudium, Deus Caritas Est)
4. Earlier papal encyclicals only if directly relevant and no modern source covers the theme

Do not cite the Church Fathers, patristic commentary, or the Catena Aurea — those are covered separately.
Do not cite Scripture directly.

For each citation, include the source and paragraph number in parentheses after the quote:
(CCC §1234) or (Gaudium et Spes §22) or (Evangelii Gaudium §n).
Do not use footnote markers like [^1].

Write in clear prose. Use **bold** for document titles. Use > blockquote for direct quotations.
Do not end with questions, offers to assist further, or invitations to reply.`;

function buildUserPrompt(gospelRef: string, dayName: string): string {
  return `The Gospel reading is ${gospelRef} (${dayName}). Provide 3 to 4 magisterial or patristic citations for a priest preparing a homily on this passage.`;
}

function parseCompactDate(s: string): boolean {
  return /^\d{8}$/.test(s);
}

// Strip artefacts that don't belong in the priest's reading pane:
// — trailing interactive offers ("If you want, tell me...")
// — footnote reference markers ([^1], [^3] etc.) whose definitions
//   never appear in the response
function cleanContent(raw: string): string {
  return raw
    .replace(/\[\^\w+\]/g, "")                          // footnote refs [^1]
    .replace(/^Below are[^\n]*\n+/i, "")               // opening "Below are N citations..."
    .replace(/^Here are[^\n]*\n+/i, "")                // opening "Here are N citations..."
    .replace(/\n*If you want[^]*$/i, "")                // trailing interactive offer
    .replace(/\n*Would you like[^]*$/i, "")             // alternate phrasing
    .replace(/\n*Let me know[^]*$/i, "")                // alternate phrasing
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !parseCompactDate(date)) {
    return NextResponse.json(
      { error: "Missing or invalid ?date=YYYYMMDD param" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // 1. Cache check
  const { data: cached } = await supabase
    .from("magisterium_cache")
    .select("content")
    .eq("date", date)
    .maybeSingle<CachedRow>();

  if (cached) {
    return NextResponse.json({ content: cached.content, cached: true });
  }

  // 2. Fetch Gospel reference from the readings API
  const readingsUrl = new URL("/api/readings", req.url);
  readingsUrl.searchParams.set("date", date);
  const readingsRes = await fetch(readingsUrl.toString());

  if (!readingsRes.ok) {
    return NextResponse.json(
      { error: "Could not fetch readings for this date" },
      { status: 500 }
    );
  }

  interface ReadingsPayload {
    dayName: string;
    readings: Array<{ id: string; reference: string }>;
  }
  const readings: ReadingsPayload = await readingsRes.json();
  const gospel = readings.readings.find((r) => r.id === "gospel");

  if (!gospel?.reference) {
    return NextResponse.json(
      { error: "Gospel reading not found for this date" },
      { status: 500 }
    );
  }

  // 3. Query Magisterium AI
  const apiKey = process.env.MAGISTERIUM_API_KEY;
  if (!apiKey) {
    console.error("[magisterium] MAGISTERIUM_API_KEY not set");
    return NextResponse.json(
      { error: "Magisterium API not configured" },
      { status: 500 }
    );
  }

  const magResponse = await fetch(MAGISTERIUM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "magisterium-1",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(gospel.reference, readings.dayName),
        },
      ],
    }),
  });

  if (!magResponse.ok) {
    const errText = await magResponse.text().catch(() => "");
    console.error("[magisterium] API error:", magResponse.status, errText);
    return NextResponse.json(
      { error: "Magisterium API request failed" },
      { status: 500 }
    );
  }

  interface MagisteriumResponse {
    choices: Array<{ message: { content: string } }>;
  }
  const magData: MagisteriumResponse = await magResponse.json();
  const raw = magData.choices?.[0]?.message?.content ?? "";

  if (!raw) {
    return NextResponse.json(
      { error: "Empty response from Magisterium AI" },
      { status: 500 }
    );
  }

  const content = cleanContent(raw);

  // 4. Cache the result (ignore race-condition duplicates — 23505)
  const { error: insertErr } = await supabase.from("magisterium_cache").insert({
    date,
    gospel_ref: gospel.reference,
    day_name: readings.dayName,
    content,
  });

  if (insertErr && insertErr.code !== "23505") {
    console.error("[magisterium] cache insert error:", insertErr);
  }

  return NextResponse.json({ content, cached: false });
}
