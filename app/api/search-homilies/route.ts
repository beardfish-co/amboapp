// POST /api/search-homilies
//
// Natural-language search over the priest's homily archive.
//
// Three-zone threshold (spec §7a):
//   < WEAK   → Postgres rejects
//   WEAK–STRONG → included only if query terms appear in text
//   ≥ STRONG → always included (semantic match with different vocabulary)

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

// ── Diagnostic types ────────────────────────────────────────────────────────
interface LayerDiag {
  layer: LayerKey;
  textLength: number;
  excerptFound: string;    // "" if no terms matched
  termMatch: boolean;
}
interface RowDiag {
  title: string | null;
  score: number;
  matchedLayer: LayerKey;
  layers: LayerDiag[];
  anyTermMatch: boolean;
  isStrong: boolean;
  decision: "included" | "excluded-no-terms" | "included-strong-fallback";
  excerpt: string;
}

function layerText(row: SearchRow, layer: LayerKey): string {
  switch (layer) {
    case "thread":    return row.seed ?? "";
    case "followups": return buildFollowupsText(row.seed_why_now, row.seed_eucharist, row.seed_response);
    case "notes":     return row.notes ?? "";
    case "content":   return stripHtml(row.content);
  }
}

function extractExcerptWithLayer(
  row: SearchRow,
  query: string,
  score: number,
): { excerpt: string; excerptLayer: LayerKey; diag: RowDiag } | null {
  const MIN_USEFUL = 50;
  const LAYERS: LayerKey[] = ["thread", "followups", "notes", "content"];
  const isStrong = score >= STRONG_THRESHOLD;

  const layerDiags: LayerDiag[] = [];

  // Probe all layers, matched layer first
  const orderedLayers: LayerKey[] = [
    row.matched_layer,
    ...LAYERS.filter((l) => l !== row.matched_layer),
  ];

  let bestExcerpt = "";
  let bestLayer: LayerKey = row.matched_layer;
  let anyTermMatch = false;

  for (const layer of orderedLayers) {
    const text = layerText(row, layer);
    const excerpt = findExcerpt(text, query);  // "" when no terms match
    const termMatch = excerpt.length > 0;       // findExcerpt with query only returns non-empty if terms matched
    if (termMatch) anyTermMatch = true;

    layerDiags.push({
      layer,
      textLength: text.length,
      excerptFound: excerpt,
      termMatch,
    });

    if (!bestExcerpt && excerpt.length >= MIN_USEFUL) {
      bestExcerpt = excerpt;
      bestLayer = layer;
    }
  }

  // Build partial diag (decision filled in below)
  const diag: RowDiag = {
    title: row.title,
    score: Math.round(score * 1000) / 1000,
    matchedLayer: row.matched_layer,
    layers: layerDiags,
    anyTermMatch,
    isStrong,
    decision: "excluded-no-terms",
    excerpt: "",
  };

  // Decision
  if (bestExcerpt) {
    // At least one layer had a term-matched excerpt long enough to show
    diag.decision = "included";
    diag.excerpt = bestExcerpt;
    return { excerpt: bestExcerpt, excerptLayer: bestLayer, diag };
  }

  if (isStrong) {
    // Strong semantic match — fall back to first paragraph of content/thread
    const contentText = layerText(row, "content");
    const fallback = findExcerpt(contentText, undefined);
    if (fallback.length >= MIN_USEFUL) {
      diag.decision = "included-strong-fallback";
      diag.excerpt = fallback;
      return { excerpt: fallback, excerptLayer: "content", diag };
    }
    const threadText = layerText(row, "thread");
    const threadFallback = findExcerpt(threadText, undefined);
    if (threadFallback.length >= MIN_USEFUL) {
      diag.decision = "included-strong-fallback";
      diag.excerpt = threadFallback;
      return { excerpt: threadFallback, excerptLayer: "thread", diag };
    }
  }

  // Weak match with no term evidence — exclude per spec §7a
  diag.decision = "excluded-no-terms";
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
    return NextResponse.json({ results: [], query: parsed, totalFound: 0, _debug: [] });
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
  console.log(`[search-homilies] parsed="${termForExcerpt}" rows_from_db=${(rows as unknown[])?.length ?? 0} weak=${WEAK_THRESHOLD} strong=${STRONG_THRESHOLD}`);

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

  const debugRows: RowDiag[] = [];

  for (const row of (rows as SearchRow[] ?? [])) {
    const excerptResult = extractExcerptWithLayer(row, termForExcerpt, row.best_score);

    if (excerptResult === null) {
      // Build a diag entry for the excluded row so it's visible in _debug
      const excludedDiag: RowDiag = {
        title: row.title,
        score: Math.round(row.best_score * 1000) / 1000,
        matchedLayer: row.matched_layer,
        layers: [],
        anyTermMatch: false,
        isStrong: row.best_score >= STRONG_THRESHOLD,
        decision: "excluded-no-terms",
        excerpt: "",
      };
      debugRows.push(excludedDiag);
      console.log(`[search-homilies] EXCLUDED "${row.title}" score=${row.best_score.toFixed(3)} strong=${row.best_score >= STRONG_THRESHOLD}`);
      continue;
    }

    debugRows.push(excerptResult.diag);
    console.log(`[search-homilies] INCLUDED "${row.title}" score=${row.best_score.toFixed(3)} decision=${excerptResult.diag.decision} anyTermMatch=${excerptResult.diag.anyTermMatch}`);

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

  return NextResponse.json({
    results,
    query: parsed,
    totalFound: results.length,
    _debug: debugRows,   // temporary — remove before production
  });
}
