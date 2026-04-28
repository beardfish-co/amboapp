// POST /api/search-homilies

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

const DOC_THRESHOLD  = 0.17;   // Postgres-side floor (whole-document score)
const PARA_THRESHOLD = 0.35;   // Calibrated from real beta data: clean gap between trap queries (0.31-0.33) and semantic matches (0.36+)
const STRONG_LABEL   = 0.50;   // Para score above which result is labelled "strong"
const MAX_RESULTS    = 20;
const MIN_PARA_LENGTH = 40;

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

interface ParaDiag {
  text: string;
  score: number;
}

interface RowDiag {
  title: string | null;
  docScore: number;
  paraCount: number;
  bestParaScore: number;
  bestParaText: string;
  allParas: ParaDiag[];
  decision: "included" | "excluded-below-para-threshold" | "excluded-no-content";
  excerptShown: string;
}

// Always returns a diag — even for excluded rows — so calibration data is never lost.
interface ParaEvalResult {
  excerpt: string | null;
  excerptLayer: LayerKey;
  bestScore: number;
  diag: RowDiag;
}

function layerText(row: SearchRow, layer: LayerKey): string {
  switch (layer) {
    case "thread":    return row.seed ?? "";
    case "followups": return buildFollowupsText(row.seed_why_now, row.seed_eucharist, row.seed_response);
    case "notes":     return row.notes ?? "";
    case "content":   return stripHtml(row.content);
  }
}

async function evaluateParagraphs(
  row: SearchRow,
  queryEmbedding: number[],
): Promise<ParaEvalResult> {
  const contentText = layerText(row, "content");
  const paras = splitParagraphs(contentText, MIN_PARA_LENGTH);

  const threadText = layerText(row, "thread");
  const notesText  = layerText(row, "notes");
  const extras: Array<{ text: string; layer: LayerKey }> = [];
  if (threadText.length >= MIN_PARA_LENGTH) extras.push({ text: threadText, layer: "thread" });
  if (notesText.length  >= MIN_PARA_LENGTH) extras.push({ text: notesText,  layer: "notes"  });

  const candidates: Array<{ text: string; layer: LayerKey }> = [
    ...paras.map((p) => ({ text: p, layer: "content" as LayerKey })),
    ...extras,
  ];

  if (candidates.length === 0) {
    return {
      excerpt: null, excerptLayer: "content", bestScore: 0,
      diag: {
        title: row.title, docScore: Math.round(row.best_score * 1000) / 1000,
        paraCount: 0, bestParaScore: 0, bestParaText: "", allParas: [],
        decision: "excluded-no-content", excerptShown: "",
      },
    };
  }

  // Embed all paragraphs in parallel
  const embeddings = await Promise.all(
    candidates.map((c) => generateEmbedding(c.text.slice(0, 2000)))
  );

  let bestScore = 0;
  let bestText  = "";
  let bestLayer: LayerKey = "content";
  const paraDiags: ParaDiag[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const emb = embeddings[i];
    if (!emb) continue;
    const score = dotProduct(queryEmbedding, emb);
    paraDiags.push({ text: candidates[i].text.slice(0, 120), score: Math.round(score * 1000) / 1000 });
    if (score > bestScore) {
      bestScore = score;
      bestText  = candidates[i].text;
      bestLayer = candidates[i].layer;
    }
  }

  paraDiags.sort((a, b) => b.score - a.score);

  const passed = bestScore >= PARA_THRESHOLD;

  let excerpt: string | null = null;
  if (passed) {
    excerpt = bestText.length > 280
      ? bestText.slice(0, bestText.lastIndexOf(" ", 280) || 280) + "…"
      : bestText;
  }

  return {
    excerpt,
    excerptLayer: bestLayer,
    bestScore,
    diag: {
      title: row.title,
      docScore: Math.round(row.best_score * 1000) / 1000,
      paraCount: candidates.length,
      bestParaScore: Math.round(bestScore * 1000) / 1000,
      bestParaText: bestText.slice(0, 120),
      allParas: paraDiags,
      decision: passed ? "included" : "excluded-below-para-threshold",
      excerptShown: excerpt ?? "",
    },
  };
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
    return NextResponse.json({ error: "Search failed", detail: searchErr.message }, { status: 500 });
  }

  const candidates = (rows as SearchRow[]) ?? [];
  console.log(`[search-homilies] query="${parsed.thematic}" candidates=${candidates.length} doc≥${DOC_THRESHOLD} para≥${PARA_THRESHOLD}`);

  const evals = await Promise.all(
    candidates.map((row) => evaluateParagraphs(row, queryEmbedding))
  );

  const results: Array<{
    id: string; title: string | null; sundayDate: string | null;
    updatedAt: string; score: number; confidence: "strong" | "weak";
    matchedLayer: LayerKey; excerptLayer: LayerKey; excerpt: string;
  }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const row  = candidates[i];
    const eval_ = evals[i];
    console.log(`[search-homilies] "${row.title}" doc=${row.best_score.toFixed(3)} bestPara=${eval_.bestScore.toFixed(3)} decision=${eval_.diag.decision}`);
    if (eval_.excerpt === null) continue;
    results.push({
      id: row.id, title: row.title, sundayDate: row.sunday_date,
      updatedAt: row.updated_at,
      score: Math.round(eval_.bestScore * 1000) / 1000,
      confidence: eval_.bestScore >= STRONG_LABEL ? "strong" : "weak",
      matchedLayer: row.matched_layer,
      excerptLayer: eval_.excerptLayer,
      excerpt: eval_.excerpt,
    });
  }

  console.log(`[search-homilies] final=${results.length}`);

  return NextResponse.json({
    results, query: parsed, totalFound: results.length,
    _debug: evals.map((e) => e.diag),
  });
}
