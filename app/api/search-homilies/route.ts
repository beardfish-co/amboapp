// POST /api/search-homilies
//
// Natural-language search over the priest's homily archive.
//
// Two-threshold architecture (spec §7a):
//
//   DOC_THRESHOLD (Postgres):
//     Whole-document cosine similarity floor. Keeps near-zero noise out of
//     the pipeline. Candidates that pass come into TypeScript for para-level
//     evaluation.
//
//   PARA_THRESHOLD (application):
//     Per-paragraph cosine similarity between the query and each paragraph of
//     a candidate homily. A homily passes only if at least one paragraph
//     exceeds this threshold. The best-matching paragraph becomes the excerpt.
//     This is the true semantic gate — it requires a passage that genuinely
//     matches the query's *meaning*, not just its vocabulary.
//
// _debug (temporary): returned with every response while thresholds are being
//   tuned. Shows doc score, per-paragraph scores, and gate decision for every
//   candidate that came through Postgres. Remove before production.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearchQuery } from "@/lib/search-parser";
import {
  generateEmbedding,
  stripHtml,
  buildFollowupsText,
  dotProduct,
  splitParagraphs,
} from "@/lib/embeddings";

// Whole-document floor — keeps near-zero noise out before para evaluation.
const DOC_THRESHOLD  = 0.17;
// Per-paragraph similarity required to include a homily and produce an excerpt.
// Set conservatively while calibrating; tune up once real scores are known.
const PARA_THRESHOLD = 0.40;
// Above this doc score the result is labelled "strong" (display only).
const STRONG_LABEL   = 0.26;

const MAX_RESULTS = 20;
const MIN_PARA_LENGTH = 40; // chars; shorter paras excluded from search

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

// ── Diagnostic types ─────────────────────────────────────────────────────────

interface ParaDiag {
  text: string;          // first 120 chars of paragraph
  score: number;         // cosine similarity to query
}

interface RowDiag {
  title: string | null;
  docScore: number;
  paraCount: number;
  bestParaScore: number;
  bestParaText: string;  // first 120 chars
  allParas: ParaDiag[];
  decision: "included" | "excluded-below-para-threshold" | "excluded-embed-failed";
  excerptShown: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function layerText(row: SearchRow, layer: LayerKey): string {
  switch (layer) {
    case "thread":    return row.seed ?? "";
    case "followups": return buildFollowupsText(row.seed_why_now, row.seed_eucharist, row.seed_response);
    case "notes":     return row.notes ?? "";
    case "content":   return stripHtml(row.content);
  }
}

// ── Core para-similarity search ───────────────────────────────────────────────

/**
 * For a single candidate homily, embed every paragraph of its content layer,
 * compute cosine similarity to the query embedding, and return the best match.
 *
 * Returns null if no paragraph can be embedded or the best score is below
 * PARA_THRESHOLD (= no matched chunk → no result, per spec §7a).
 */
async function findBestParagraph(
  row: SearchRow,
  queryEmbedding: number[],
): Promise<{
  excerpt: string;
  excerptLayer: LayerKey;
  bestScore: number;
  diag: RowDiag;
} | null> {
  // Collect candidate text from all four layers; content layer is primary
  const contentText = layerText(row, "content");
  const paras = splitParagraphs(contentText, MIN_PARA_LENGTH);

  // Also include thread/seed as single unit if long enough
  const threadText = layerText(row, "thread");
  const notesText  = layerText(row, "notes");
  const extraParas: Array<{ text: string; layer: LayerKey }> = [];
  if (threadText.length >= MIN_PARA_LENGTH)
    extraParas.push({ text: threadText, layer: "thread" });
  if (notesText.length >= MIN_PARA_LENGTH)
    extraParas.push({ text: notesText, layer: "notes" });

  const allCandidates: Array<{ text: string; layer: LayerKey }> = [
    ...paras.map((p) => ({ text: p, layer: "content" as LayerKey })),
    ...extraParas,
  ];

  if (allCandidates.length === 0) {
    const diag: RowDiag = {
      title: row.title, docScore: row.best_score, paraCount: 0,
      bestParaScore: 0, bestParaText: "", allParas: [],
      decision: "excluded-embed-failed", excerptShown: "",
    };
    return null;
  }

  // Embed all paragraphs in parallel to minimise latency
  const embeddings = await Promise.all(
    allCandidates.map((c) => generateEmbedding(c.text.slice(0, 2000)))
  );

  let bestScore = 0;
  let bestText  = "";
  let bestLayer: LayerKey = "content";
  const paraDiags: ParaDiag[] = [];

  for (let i = 0; i < allCandidates.length; i++) {
    const emb = embeddings[i];
    if (!emb) continue;
    const score = dotProduct(queryEmbedding, emb);
    paraDiags.push({ text: allCandidates[i].text.slice(0, 120), score: Math.round(score * 1000) / 1000 });
    if (score > bestScore) {
      bestScore = score;
      bestText  = allCandidates[i].text;
      bestLayer = allCandidates[i].layer;
    }
  }

  // Sort by score descending for readable debug output
  paraDiags.sort((a, b) => b.score - a.score);

  const passed = bestScore >= PARA_THRESHOLD;
  const diag: RowDiag = {
    title: row.title,
    docScore: Math.round(row.best_score * 1000) / 1000,
    paraCount: allCandidates.length,
    bestParaScore: Math.round(bestScore * 1000) / 1000,
    bestParaText: bestText.slice(0, 120),
    allParas: paraDiags,
    decision: passed ? "included" : "excluded-below-para-threshold",
    excerptShown: passed ? bestText.slice(0, 280) : "",
  };

  if (!passed) return null;

  // Truncate to 280 chars at a word boundary
  let excerpt = bestText;
  if (excerpt.length > 280) {
    const cut = excerpt.lastIndexOf(" ", 280);
    excerpt = excerpt.slice(0, cut > 0 ? cut : 280) + "…";
  }

  return { excerpt, excerptLayer: bestLayer, bestScore, diag };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { query: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { query } = body;
  if (!query || typeof query !== "string" || query.trim().length < 2)
    return NextResponse.json({ error: "Query too short" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const parsed = await parseSearchQuery(query.trim(), today);

  if (!parsed.thematic)
    return NextResponse.json({ results: [], query: parsed, totalFound: 0, _debug: [] });

  // Embed the query once — reused for both doc-level search and para scoring
  const queryEmbedding = await generateEmbedding(parsed.thematic);
  if (!queryEmbedding)
    return NextResponse.json({ error: "Embedding generation failed" }, { status: 503 });

  // Doc-level search via pgvector (Postgres-side floor filter)
  const { data: rows, error: searchErr } = await supabase.rpc("search_homilies", {
    p_user_id: user.id,
    p_query_embedding: `[${queryEmbedding.join(",")}]`,
    p_from_date: parsed.dateRange?.from ?? null,
    p_to_date: parsed.dateRange?.to ?? null,
    p_match_threshold: DOC_THRESHOLD,
    p_max_results: MAX_RESULTS,
  });

  if (searchErr) {
    console.error("[search-homilies] RPC error:", searchErr.message);
    return NextResponse.json({ error: "Search failed", detail: searchErr.message }, { status: 500 });
  }

  const candidates = (rows as SearchRow[]) ?? [];
  console.log(`[search-homilies] query="${parsed.thematic}" doc_candidates=${candidates.length} doc_floor=${DOC_THRESHOLD} para_threshold=${PARA_THRESHOLD}`);

  // Para-level evaluation: run all candidates in parallel
  const paraResults = await Promise.all(
    candidates.map((row) => findBestParagraph(row, queryEmbedding))
  );

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

  for (let i = 0; i < candidates.length; i++) {
    const row    = candidates[i];
    const result = paraResults[i];

    if (!result) {
      // Build a minimal diag for excluded rows (diag is on result when included)
      const excludedDiag: RowDiag = {
        title: row.title,
        docScore: Math.round(row.best_score * 1000) / 1000,
        paraCount: 0,
        bestParaScore: 0,
        bestParaText: "",
        allParas: [],
        decision: "excluded-below-para-threshold",
        excerptShown: "",
      };
      debugRows.push(excludedDiag);
      console.log(`[search-homilies] EXCLUDED "${row.title}" docScore=${row.best_score.toFixed(3)}`);
      continue;
    }

    debugRows.push(result.diag);
    console.log(`[search-homilies] INCLUDED "${row.title}" docScore=${row.best_score.toFixed(3)} bestParaScore=${result.bestScore.toFixed(3)}`);

    results.push({
      id: row.id,
      title: row.title,
      sundayDate: row.sunday_date,
      updatedAt: row.updated_at,
      score: Math.round(result.bestScore * 1000) / 1000,  // show para score, not doc score
      confidence: result.bestScore >= STRONG_LABEL ? "strong" : "weak",
      matchedLayer: row.matched_layer,
      excerptLayer: result.excerptLayer,
      excerpt: result.excerpt,
    });
  }

  console.log(`[search-homilies] final results=${results.length}`);

  return NextResponse.json({
    results,
    query: parsed,
    totalFound: results.length,
    _debug: debugRows,  // remove before production
  });
}
