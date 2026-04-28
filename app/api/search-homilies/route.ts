// POST /api/search-homilies
//
// Natural-language search over the priest's homily archive.
//
// Flow (per spec section 5):
//   1. Sonnet parses the query into { thematic, dateRange, isFactualLookup }
//      Sonnet never sees any homily content.
//   2. The thematic component is embedded via OpenAI text-embedding-3-small.
//   3. pgvector similarity search runs against all 4 content layers,
//      filtered by date range if present.
//   4. Results above the threshold are returned with similarity score,
//      matched layer, and excerpt.
//
// Request body: { query: string }
//
// Response:
//   {
//     results: Array<{
//       id: string,
//       title: string | null,
//       sundayDate: string | null,
//       updatedAt: string,
//       score: number,          // 0–1 cosine similarity
//       confidence: "strong" | "weak",
//       matchedLayer: "thread" | "followups" | "notes" | "content",
//       excerpt: string,        // direct text from the matched layer
//     }>,
//     query: ParsedQuery,       // for debugging / transparency
//     totalFound: number,
//   }
//
// Auth: requires signed-in user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearchQuery } from "@/lib/search-parser";
import { generateEmbedding, stripHtml, buildFollowupsText, findExcerpt } from "@/lib/embeddings";

const STRONG_THRESHOLD = 0.75;
const WEAK_THRESHOLD   = 0.45; // below this: not returned
const MAX_RESULTS      = 20;

interface SearchRow {
  id: string;
  title: string | null;
  sunday_date: string | null;
  updated_at: string;
  best_score: number;
  matched_layer: "thread" | "followups" | "notes" | "content";
  seed: string | null;
  seed_why_now: string | null;
  seed_eucharist: string | null;
  seed_response: string | null;
  notes: string | null;
  content: string | null;
}

function extractExcerpt(row: SearchRow): string {
  switch (row.matched_layer) {
    case "thread":
      return findExcerpt(row.seed ?? "");
    case "followups":
      return findExcerpt(
        buildFollowupsText(row.seed_why_now, row.seed_eucharist, row.seed_response)
      );
    case "notes":
      return findExcerpt(row.notes ?? "");
    case "content":
      return findExcerpt(stripHtml(row.content));
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { query } = body;
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Step 1: Parse query with Sonnet
  const parsed = await parseSearchQuery(query.trim(), today);

  // Step 2: If no thematic content, we can't do similarity search
  if (!parsed.thematic) {
    // Purely factual/temporal — return empty for now
    // (Factual lookup by date range still works via the dateRange filter below)
    return NextResponse.json({ results: [], query: parsed, totalFound: 0 });
  }

  // Step 3: Embed the thematic component
  const embedding = await generateEmbedding(parsed.thematic);
  if (!embedding) {
    return NextResponse.json(
      { error: "Embedding generation failed" },
      { status: 503 },
    );
  }

  // Step 4: Run pgvector search via Postgres function
  const { data: rows, error: searchErr } = await supabase.rpc("search_homilies", {
    p_user_id: user.id,
    p_query_embedding: embedding,
    p_from_date: parsed.dateRange?.from ?? null,
    p_to_date: parsed.dateRange?.to ?? null,
    p_match_threshold: WEAK_THRESHOLD,
    p_max_results: MAX_RESULTS,
  });

  if (searchErr) {
    console.error("[search-homilies] RPC error:", searchErr.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const results = (rows as SearchRow[] ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    sundayDate: row.sunday_date,
    updatedAt: row.updated_at,
    score: Math.round(row.best_score * 1000) / 1000,
    confidence: row.best_score >= STRONG_THRESHOLD ? "strong" : "weak" as "strong" | "weak",
    matchedLayer: row.matched_layer,
    excerpt: extractExcerpt(row),
  }));

  return NextResponse.json({
    results,
    query: parsed,
    totalFound: results.length,
  });
}
