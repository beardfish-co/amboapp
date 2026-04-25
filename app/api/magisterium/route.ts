// GET /api/magisterium?date=YYYYMMDD
//
// Returns magisterial citations relevant to the Sunday Gospel, sourced from
// the Magisterium AI API. Responses are cached in Supabase — one generation
// per liturgical day, shared across all priests.
//
// Flow:
//   1. Check magisterium_cache WHERE date = ?
//   2. If present: return immediately (cached: true).
//   3. Else: fetch Gospel reference from readings API, query Magisterium AI,
//      parse citations from response, insert into cache, return.
//
// Response shape:
//   {
//     citations: Array<{ text: string; source: string }>;
//     cached: boolean;
//   }
//
// Error handling:
//   400 — missing or invalid date param
//   500 — upstream API failure or parse error
//
// Auth: requires an authenticated user (RLS enforced on magisterium_cache).
//
// Attribution: Magisterium API Terms §4.5 requires "Powered by Magisterium AI"
// to appear in any UI that surfaces this data. See ReflectView.tsx.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface MagisteriumCitation {
  text: string;
  source: string;
}

interface CachedRow {
  citations: MagisteriumCitation[];
}

const MAGISTERIUM_API_URL =
  "https://www.magisterium.com/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are a theological reference assistant for Catholic preachers preparing a homily. 
Given a Gospel passage, identify 3 to 4 relevant quotations from official magisterial sources — 
such as the Catechism of the Catholic Church, papal encyclicals, Vatican II documents, 
or apostolic exhortations — that illuminate the central themes of the passage.

Return only valid JSON in this exact format with no other text before or after:
{
  "citations": [
    {
      "text": "exact quote from the document",
      "source": "Document name, §paragraph or article number"
    }
  ]
}`;

function buildUserPrompt(gospelRef: string, dayName: string): string {
  return `The Gospel reading is ${gospelRef} (${dayName}). Identify 3 to 4 relevant magisterial citations for a preacher preparing a homily on this passage.`;
}

function parseCompactDate(s: string): boolean {
  return /^\d{8}$/.test(s);
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
    .select("citations")
    .eq("date", date)
    .maybeSingle<CachedRow>();

  if (cached) {
    return NextResponse.json({ citations: cached.citations, cached: true });
  }

  // 2. Need to generate — fetch Gospel reference from readings API first
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
    choices: Array<{
      message: { content: string };
    }>;
  }
  const magData: MagisteriumResponse = await magResponse.json();
  const content = magData.choices?.[0]?.message?.content ?? "";

  // 4. Parse JSON from response
  let citations: MagisteriumCitation[] = [];
  try {
    // Strip any markdown code fences the model might add
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { citations?: MagisteriumCitation[] };
    citations = Array.isArray(parsed.citations) ? parsed.citations : [];
  } catch (err) {
    console.error("[magisterium] Failed to parse response JSON:", err, content);
    return NextResponse.json(
      { error: "Failed to parse Magisterium AI response" },
      { status: 500 }
    );
  }

  if (citations.length === 0) {
    return NextResponse.json(
      { error: "No citations returned from Magisterium AI" },
      { status: 500 }
    );
  }

  // 5. Cache the result (ignore race-condition duplicates)
  const { error: insertErr } = await supabase.from("magisterium_cache").insert({
    date,
    gospel_ref: gospel.reference,
    day_name: readings.dayName,
    citations,
  });

  if (insertErr && insertErr.code !== "23505") {
    // 23505 = unique_violation — expected under race, safe to ignore
    console.error("[magisterium] cache insert error:", insertErr);
    // Still return the citations; cache miss on next request is acceptable
  }

  return NextResponse.json({ citations, cached: false });
}
