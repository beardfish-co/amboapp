// GET /api/magisterium?date=YYYYMMDD
//
// Returns Church teaching relevant to the Sunday Gospel, sourced from the
// Magisterium AI API. Responses are cached in Supabase — one generation per
// liturgical day, shared across all priests.
//
// Flow:
//   1. Check magisterium_cache WHERE date = ?
//   2. If present: return immediately (cached: true).
//   3. Else: fetch Gospel reference from readings API, query Magisterium AI
//      (shared prompt in lib/magisterium.ts), store in cache, return.
//
// Response shape:
//   { content: string; points: TeachingPoint[]; cached: boolean }
//   `points` (verified passages with sources) is empty for old cache rows
//   that predate stored citations; the UI then falls back to `content`.
//
// Error handling:
//   400 — missing or invalid date param
//   401 — not signed in
//   500 — upstream API failure
//
// Attribution: Magisterium API Terms §4.5 requires "Powered by Magisterium AI"
// in any UI that surfaces this data. See ReflectView.tsx.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  queryMagisterium,
  buildTeachingPoints,
  type MagisteriumCitation,
} from "@/lib/magisterium";

interface CachedRow {
  content: string;
  content_raw: string | null;
  citations: MagisteriumCitation[] | null;
}

function parseCompactDate(s: string): boolean {
  return /^\d{8}$/.test(s);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !parseCompactDate(date)) {
    return NextResponse.json(
      { error: "Missing or invalid ?date=YYYYMMDD param" },
      { status: 400 }
    );
  }

  // 1. Cache check
  const { data: cached } = await supabase
    .from("magisterium_cache")
    .select("content, content_raw, citations")
    .eq("date", date)
    .maybeSingle<CachedRow>();

  if (cached) {
    return NextResponse.json({
      content: cached.content,
      points: buildTeachingPoints(cached.content_raw, cached.citations),
      cached: true,
    });
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
    saint?: string;
    readings: Array<{ id: string; reference: string }>;
  }
  const readings: ReadingsPayload = await readingsRes.json();
  const gospel = readings.readings.find((r) => r.id === "gospel");
  // Universalis puts Sunday names in `saint` (e.g. "29th Sunday in Ordinary Time").
  const dayName = readings.dayName || readings.saint || "";

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

  const result = await queryMagisterium(gospel.reference, dayName, apiKey);
  if (!result.ok) {
    console.error("[magisterium] API error:", result.status, result.error);
    return NextResponse.json(
      { error: "Magisterium API request failed" },
      { status: 500 }
    );
  }

  // 4. Cache the result (ignore race-condition duplicates — 23505)
  const { error: insertErr } = await supabase.from("magisterium_cache").insert({
    date,
    gospel_ref: gospel.reference,
    day_name: dayName,
    content: result.content,
    content_raw: result.contentRaw,
    citations: result.citations,
  });

  if (insertErr && insertErr.code !== "23505") {
    console.error("[magisterium] cache insert error:", insertErr);
  }

  return NextResponse.json({
    content: result.content,
    points: buildTeachingPoints(result.contentRaw, result.citations),
    cached: false,
  });
}
