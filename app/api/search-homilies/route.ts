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
//   4. Three-zone threshold filter (spec §7a):
//        < WEAK_THRESHOLD  → never returned (Postgres rejects)
//        WEAK–STRONG       → only returned if query terms appear in the text
//                           (no matched chunk → no result)
//        ≥ STRONG          → returned unconditionally (genuine semantic match)
//
// Note on score calibration:
//   The spec's §7a floor of ~0.55 is calibrated for passage-level embeddings.
//   With whole-document embeddings, cosine scores compress to 0.15–0.35.
//   STRONG/WEAK here are calibrated to that range. Thresholds will rise when
//   passage-level embeddings are implemented.
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
//       score: number,
//       confidence: "strong" | "weak",
//       matchedLayer: "thread" | "followups" | "notes" | "content",
//       excerptLayer: "thread" | "followups" | "notes" | "content",
//       excerpt: string,
//     }>,
//     query: ParsedQuery,
//     totalFound: number,
//   }
//
// Auth: requires signed-in user.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearchQuery } from "@/lib/search-parser";
import {
  generateEmbedding,
  stripHtml,
  buildFollowupsText,
  findExcerpt,
  hasTermMatch,
} from "@/lib/embeddings";

// Thresholds calibrated for whole-document cosine similarity (text-embedding-3-small).
// Passage-level embeddings (planned) will push scores into the 0.55+ range; these
// thresholds will rise accordingly.
//
// Three zones:
//   < WEAK   → Postgres rejects; never reaches application layer
//   WEAK–STRONG → included only if query terms appear in text (§7a: no matched chunk = no result)
//   ≥ STRONG → always included (trust the semantic match regardless of exact term presence)
const STRONG_THRESHOLD = 0.26;
const WEAK_THRESHOLD   = 0.20;
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

type LayerKey = SearchRow["matched_layer"];

function layerText(row: SearchRow, layer: LayerKey): string {
  switch (layer) {
    case "thread":    return row.seed ?? "";
    case "followups": return buildFollowupsText(row.seed_why_now, row.seed_eucharist, row.seed_response);
    case "notes":     return row.notes ?? "";
    case "content":   return stripHtml(row.content);
  }
}

/**
 * Find the best excerpt and its source layer for a result row.
 *
 * Returns null when:
 *   - the score is below STRONG_THRESHOLD, AND
 *   - no query term appears in any text layer
 * This implements spec §7a: "no matched chunk → no result".
 * It prevents the system from showing the opening line of an irrelevant homily
 * just because it's the closest document in the corpus.
 */
function extractExcerptWithLayer(
  row: SearchRow,
  query: string,
  score: number,
): { excerpt: string; excerptLayer: LayerKey } | null {
  const MIN_USEFUL = 50;
  const LAYERS: LayerKey[] = ["thread", "followups", "notes", "content"];

  // 1. Try the matched layer first — most likely to contain relevant text
  const primaryText = layerText(row, row.matched_layer);
  const primaryExcerpt = findExcerpt(primaryText, query);
  if (primaryExcerpt.length >= MIN_USEFUL) {
    return { excerpt: primaryExcerpt, excerptLayer: row.matched_layer };
  }

  // 2. Try the other layers in order
  for (const layer of LAYERS) {
    if (layer === row.matched_layer) continue;
    const text = layerText(row, layer);
    const excerpt = findExcerpt(text, query);
    if (excerpt.length >= MIN_USEFUL) {
      return { excerpt, excerptLayer: layer };
    }
  }

  // 3. No layer yielded a long-enough excerpt with query-term hits.
  //    For STRONG matches, trust the semantic score and fall back to the first
  //    substantial paragraph of the content layer (the homily body).
  if (score >= STRONG_THRESHOLD) {
    const contentText = layerText(row, "content");
    const fallback = findExcerpt(contentText, undefined); // no query = first paragraph
    if (fallback.length >= MIN_USEFUL) {
      return { excerpt: fallback, excerptLayer: "content" };
    }
    const threadText = layerText(row, "thread");
    const threadFallback = findExcerpt(threadText, undefined);
    if (threadFallback.length >= MIN_USEFUL) {
      return { excerpt: threadFallback, excerptLayer: "thread" };
    }
  }

  // 4. Weak match with no term evidence anywhere: spec §7a — exclude entirely.
  //    Verify: does ANY layer contain at least one query term?
  const anyTermMatch = LAYERS.some((layer) => hasTermMatch(layerText(row, layer), query));
  if (!anyTermMatch) {
    // No chunk matched — do not show this result.
    return null;
  }

  // 5. Terms are present but excerpts are all short — return what we have from matched layer.
  return { excerpt: primaryExcerpt, excerptLayer: row.matched_layer };
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

  // Step 4: Run pgvector search — Postgres applies the WEAK floor
  const { data: rows, error: searchErr } = await supabase.rpc("search_homilies", {
    p_user_id: user.id,
    p_query_embedding: `[${embedding.join(",")}]`,
    p_from_date: parsed.dateRange?.from ?? null,
    p_to_date: parsed.dateRange?.to ?? null,
    p_match_threshold: WEAK_THRESHOLD,
    p_max_results: MAX_RESULTS,
  });

  if (searchErr) {
    console.error("[search-homilies] RPC error:", searchErr.message, searchErr.details, searchErr.hint);
    return NextResponse.json({ error: "Search failed", detail: searchErr.message }, { status: 500 });
  }

  const termForExcerpt = parsed.thematic ?? query.trim();
  console.log(`[search-homilies] query="${termForExcerpt}" rows_from_db=${(rows as unknown[])?.length ?? 0}`);

  // Step 5: Apply three-zone filter in application layer
  const results: Array<{
    id: string;
    title: string | null;
    sundayDate: string | null;
    updatedAt: string;
    score: number;
    confidence: "strong" | "weak";
    matchedLayer: LayerKey;
    excerptLayer: LayerKey;
    excerpt: string;
  }> = [];

  for (const row of (rows as SearchRow[] ?? [])) {
    const excerptResult = extractExcerptWithLayer(row, termForExcerpt, row.best_score);
    if (excerptResult === null) {
      // §7a: no matched chunk — exclude
      console.log(`[search-homilies] excluded "${row.title}" (score=${row.best_score.toFixed(3)}, no term match)`);
      continue;
    }
    results.push({
      id: row.id,
      title: row.title,
      sundayDate: row.sunday_date,
      updatedAt: row.updated_at,
      score: Math.round(row.best_score * 1000) / 1000,
      confidence: row.best_score >= STRONG_THRESHOLD ? "strong" : "weak",
      matchedLayer: row.matched_layer,
      excerptLayer: excerptResult.excerptLayer,
      excerpt: excerptResult.excerpt,
    });
  }

  console.log(`[search-homilies] after threshold+term filter: ${results.length} results`);

  return NextResponse.json({
    results,
    query: parsed,
    totalFound: results.length,
  });
}
