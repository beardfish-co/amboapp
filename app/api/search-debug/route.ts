// POST /api/search-debug — temporary diagnostic, threshold = 0, returns raw scores
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding } from "@/lib/embeddings";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await req.json() as { query: string };
  const embedding = await generateEmbedding(query);
  if (!embedding) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

  const embeddingStr = `[${embedding.join(",")}]`;

  const { data, error } = await supabase.rpc("search_homilies", {
    p_user_id: user.id,
    p_query_embedding: embeddingStr,
    p_from_date: null,
    p_to_date: null,
    p_match_threshold: 0.0,   // zero threshold — return everything
    p_max_results: 20,
  });

  return NextResponse.json({
    query,
    embeddingLength: embedding.length,
    error: error?.message ?? null,
    rows: (data ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title,
      best_score: r.best_score,
      matched_layer: r.matched_layer,
    })),
  });
}
