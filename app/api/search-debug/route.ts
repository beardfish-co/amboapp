// POST /api/search-debug — temporary diagnostic
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateEmbedding, stripHtml, findExcerpt } from "@/lib/embeddings";

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
    p_match_threshold: 0.0,
    p_max_results: 20,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  return NextResponse.json({
    query,
    rows: rows.map((r) => {
      const rawContent = r.content as string | null;
      const stripped = stripHtml(rawContent);
      const paragraphs = stripped.split(/\n+/).map((s: string) => s.trim()).filter((p: string) => p.length > 20);
      const excerpt = findExcerpt(stripped, query);
      return {
        id: r.id,
        title: r.title,
        best_score: r.best_score,
        matched_layer: r.matched_layer,
        rawContentSnippet: rawContent?.slice(0, 200),
        strippedSnippet: stripped.slice(0, 300),
        paragraphCount: paragraphs.length,
        paragraphs: paragraphs.slice(0, 5),
        excerpt,
      };
    }),
  });
}
