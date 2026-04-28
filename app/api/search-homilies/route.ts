// POST /api/search-homilies
//
// Natural-language search over the priest's homily archive.
//
// Three-zone threshold (spec §7a):
//   < WEAK_THRESHOLD  → Postgres rejects; never reaches application layer
//   WEAK–STRONG       → included only if query terms appear in text
//                       (spec §6/§7a: no matched chunk = no result)
//   ≥ STRONG          → always included; trust the semantic match even if
//                       vocabulary differs (fallback to first paragraph)
//
// Note on score calibration:
//   The spec's §7a floor of ~0.55 is calibrated for passage-level embeddings.
//   With whole-document embeddings, cosine scores compress to 0.15–0.35.
//   Thresholds here are calibrated to that range and will rise when
//   passage-level embeddings are implemented.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearchQuery } from "@/lib/search-parser";
import {
  generateEmbedding,
  stripHtml,
  buildFollowupsText,
  findExcerpt,
} from "@/lib/embeddings";

// Calibrated from real beta data (whole-document cosine, text-embedding-3-small).
// WEAK is the Postgres floor — keeps near-zero noise out of the pipeline.
// The term-match gate in extractExcerptWithLayer is the primary discriminator.
const STRONG_THRESHOLD = 0.26;
const WEAK_THRESHOLD   = 0.17;
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
 * Returns null when the score is below STRONG_THRESHOLD and no query term
 * appears in any text layer. This implements spec §6/§7a: every displayed
 * excerpt must be a passage that actually matched — not a fallback opening line.
 *
 * For STRONG matches, falls back to the first substantial paragraph of the
 * content layer (genuine semantic match with different vocabulary).
 */
function extractExcerptWithLayer(
  row: SearchRow,
  query: string,
  score: number,
): { excerpt: string; excerptLayer: LayerKey } | null {
  const MIN_USEFUL = 50;
  const LAYERS: LayerKey[] = ["thread", "followups", "notes", "content"];

  // Try matched layer first, then the rest — findExcerpt returns "" if no terms match
  const orderedLayers: LayerKey[] = [
    row.matched_layer,
    ...LAYERS.filter((l) => l !== row.matched_layer),
  ];

  for (const layer of orderedLayers) {
    const excerpt = findExcerpt(layerText(row, layer), query);
    if (excerpt.length >= MIN_USEFUL) {
      return { excerpt, excerptLayer: layer };
    }
  }

  // No layer yielded a term-matched excerpt long enough to show.
  if (score >= STRONG_THRESHOLD) {
    // Trust the semantic score — fall back to first paragraph of content/thread.
    const contentFallback = findExcerpt(layerText(row, "content"), undefined);
    if (contentFallback.length >= MIN_USEFUL) {
      return { excerpt: contentFallback, excerptLayer: "content" };
    }
    const threadFallback = findExcerpt(layerText(row, "thread"), undefined);
    if (threadFallback.length >= MIN_USEFUL) {
      return { excerpt: threadFallback, excerptLayer: "thread" };
    }
  }

  // Weak match with no term evidence — exclude per spec §7a.
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const parsed = await parseSearchQuery(query.trim(), today);

  if (!parsed.thematic) {
    return NextResponse.json({ results: [], query: parsed, totalFound: 0 });
  }

  const embedding = await generateEmbedding(parsed.thematic);
  if (!embedding) {
    return NextResponse.json({ error: "Embedding generation failed" }, { status: 503 });
  }

  const { data: rows, error: searchErr } = await supabase.rpc("search_homilies", {
    p_user_id: user.id,
    p_query_embedding: `[${embedding.join(",")}]`,
    p_from_date: parsed.dateRange?.from ?? null,
    p_to_date: parsed.dateRange?.to ?? null,
    p_match_threshold: WEAK_THRESHOLD,
    p_max_results: MAX_RESULTS,
  });

  if (searchErr) {
    console.error("[search-homilies] RPC error:", searchErr.message);
    return NextResponse.json({ error: "Search failed", detail: searchErr.message }, { status: 500 });
  }

  const termForExcerpt = parsed.thematic ?? query.trim();
  console.log(`[search-homilies] query="${termForExcerpt}" rows_from_db=${(rows as unknown[])?.length ?? 0}`);

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
      console.log(`[search-homilies] excluded "${row.title}" score=${row.best_score.toFixed(3)} (no matched chunk)`);
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

  console.log(`[search-homilies] final results=${results.length}`);

  return NextResponse.json({ results, query: parsed, totalFound: results.length });
}
