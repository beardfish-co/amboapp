// POST /api/search-homilies
//
// Three-stage retrieval pipeline (spec §5–7):
//
//   Stage 1 — Doc-level pgvector (Postgres)
//     Whole-document cosine similarity ≥ DOC_THRESHOLD.
//     Fast, cheap, eliminates near-zero noise.
//
//   Stage 2 — Paragraph-level vector similarity (OpenAI embeddings)
//     Embed every paragraph of each candidate homily. Keep paragraphs that
//     score ≥ PARA_THRESHOLD against the query embedding. Top-3 per homily
//     advance to Stage 3. This catches vocabulary-sharing noise before the
//     expensive Sonnet call.
//
//   Stage 3 — Sonnet reranking (Anthropic)
//     Sonnet judges each candidate paragraph: does it genuinely relate to the
//     query? Yes/no only — no content generation. The first approved paragraph
//     becomes the excerpt. If none pass, the homily is excluded.
//     This is what discriminates "disillusionment" (lost-hope paragraph: yes)
//     from "Aquinas" (Augustine citation: no).
//
// _debug: returned while calibrating. Remove before production.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearchQuery } from "@/lib/search-parser";
import { generateEmbedding, stripHtml, buildFollowupsText, dotProduct, splitParagraphs } from "@/lib/embeddings";
import { findApprovedParagraph } from "@/lib/reranker";

const DOC_THRESHOLD  = 0.17;  // Stage 1: Postgres whole-doc floor
const PARA_THRESHOLD = 0.25;  // Stage 2: per-paragraph vector floor before Sonnet
const STRONG_LABEL   = 0.50;  // Para score above which result is labelled "strong"
const TOP_N_RERANK   = 3;     // Max paragraphs sent to Sonnet per homily
const MAX_RESULTS    = 20;
const MIN_PARA_LEN   = 40;

interface SearchRow {
  id: string; title: string | null; sunday_date: string | null;
  updated_at: string; best_score: number;
  matched_layer: "thread" | "followups" | "notes" | "content";
  seed: string | null; seed_why_now: string | null;
  seed_eucharist: string | null; seed_response: string | null;
  notes: string | null; content: string | null;
}

type LayerKey = SearchRow["matched_layer"];

interface CandidatePara { text: string; score: number; layer: LayerKey; }

interface RowDiag {
  title: string | null; docScore: number; paraCount: number;
  topParas: Array<{ text: string; score: number; rerankerDecision?: string }>;
  decision: "included" | "excluded-no-para-above-threshold" | "excluded-reranker" | "excluded-no-content";
  bestParaScore: number; excerptShown: string;
}

function layerText(row: SearchRow, layer: LayerKey): string {
  switch (layer) {
    case "thread":    return row.seed ?? "";
    case "followups": return buildFollowupsText(row.seed_why_now, row.seed_eucharist, row.seed_response);
    case "notes":     return row.notes ?? "";
    case "content":   return stripHtml(row.content);
  }
}

async function evaluateCandidate(
  row: SearchRow,
  queryEmbedding: number[],
  queryThematic: string,
): Promise<{ excerpt: string | null; excerptLayer: LayerKey; bestScore: number; diag: RowDiag }> {
  const layers: LayerKey[] = ["content", "thread", "notes", "followups"];
  const allCandidates: CandidatePara[] = [];

  for (const layer of layers) {
    const text = layerText(row, layer);
    const paras = layer === "content"
      ? splitParagraphs(text, MIN_PARA_LEN)
      : text.length >= MIN_PARA_LEN ? [text] : [];
    for (const p of paras) allCandidates.push({ text: p, score: 0, layer });
  }

  if (allCandidates.length === 0) {
    return { excerpt: null, excerptLayer: "content", bestScore: 0,
      diag: { title: row.title, docScore: row.best_score, paraCount: 0,
        topParas: [], decision: "excluded-no-content", bestParaScore: 0, excerptShown: "" } };
  }

  // Stage 2: embed all paragraphs, score against query
  const embeddings = await Promise.all(
    allCandidates.map((c) => generateEmbedding(c.text.slice(0, 2000)))
  );
  let bestScore = 0;
  const scored: CandidatePara[] = [];
  for (let i = 0; i < allCandidates.length; i++) {
    const emb = embeddings[i];
    if (!emb) continue;
    const score = dotProduct(queryEmbedding, emb);
    if (score > bestScore) bestScore = score;
    if (score >= PARA_THRESHOLD) scored.push({ ...allCandidates[i], score });
  }
  scored.sort((a, b) => b.score - a.score);

  const topParasDiag = scored.slice(0, TOP_N_RERANK).map(c => ({
    text: c.text.slice(0, 100), score: Math.round(c.score * 1000) / 1000,
  }));

  if (scored.length === 0) {
    return { excerpt: null, excerptLayer: "content", bestScore,
      diag: { title: row.title, docScore: Math.round(row.best_score * 1000) / 1000,
        paraCount: allCandidates.length, topParas: topParasDiag,
        decision: "excluded-no-para-above-threshold",
        bestParaScore: Math.round(bestScore * 1000) / 1000, excerptShown: "" } };
  }

  // Stage 3: Sonnet reranks the top-N
  const approved = await findApprovedParagraph(queryThematic, scored, TOP_N_RERANK);

  const topParasWithDecision = topParasDiag.map((p, i) => ({
    ...p,
    rerankerDecision: i < TOP_N_RERANK
      ? (approved && scored[i]?.text === approved.text ? "yes" : "no")
      : undefined,
  }));

  if (!approved) {
    return { excerpt: null, excerptLayer: "content", bestScore,
      diag: { title: row.title, docScore: Math.round(row.best_score * 1000) / 1000,
        paraCount: allCandidates.length, topParas: topParasWithDecision,
        decision: "excluded-reranker", bestParaScore: Math.round(bestScore * 1000) / 1000, excerptShown: "" } };
  }

  let excerpt = approved.text;
  if (excerpt.length > 280) {
    const cut = excerpt.lastIndexOf(" ", 280);
    excerpt = excerpt.slice(0, cut > 0 ? cut : 280) + "…";
  }

  return { excerpt, excerptLayer: approved.layer as LayerKey, bestScore: approved.score,
    diag: { title: row.title, docScore: Math.round(row.best_score * 1000) / 1000,
      paraCount: allCandidates.length, topParas: topParasWithDecision,
      decision: "included", bestParaScore: Math.round(approved.score * 1000) / 1000, excerptShown: excerpt } };
}

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

  const queryEmbedding = await generateEmbedding(parsed.thematic);
  if (!queryEmbedding)
    return NextResponse.json({ error: "Embedding generation failed" }, { status: 503 });

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
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  const candidates = (rows as SearchRow[]) ?? [];
  console.log(`[search-homilies] "${parsed.thematic}" doc_candidates=${candidates.length}`);

  // Evaluate all candidates in parallel (each evaluation runs para-embed + Sonnet internally)
  const evals = await Promise.all(
    candidates.map((row) => evaluateCandidate(row, queryEmbedding, parsed.thematic!))
  );

  const results: Array<{
    id: string; title: string | null; sundayDate: string | null; updatedAt: string;
    score: number; confidence: "strong" | "weak";
    matchedLayer: LayerKey; excerptLayer: LayerKey; excerpt: string;
  }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const ev  = evals[i];
    console.log(`[search-homilies] "${row.title}" doc=${row.best_score.toFixed(3)} bestPara=${ev.bestScore.toFixed(3)} decision=${ev.diag.decision}`);
    if (ev.excerpt === null) continue;
    results.push({
      id: row.id, title: row.title, sundayDate: row.sunday_date, updatedAt: row.updated_at,
      score: Math.round(ev.bestScore * 1000) / 1000,
      confidence: ev.bestScore >= STRONG_LABEL ? "strong" : "weak",
      matchedLayer: row.matched_layer, excerptLayer: ev.excerptLayer, excerpt: ev.excerpt,
    });
  }

  console.log(`[search-homilies] final=${results.length}`);
  return NextResponse.json({ results, query: parsed, totalFound: results.length, _debug: evals.map(e => e.diag) });
}
