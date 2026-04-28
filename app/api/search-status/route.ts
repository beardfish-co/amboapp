// GET /api/search-status
// Diagnostic endpoint — checks embedding readiness for the signed-in user.
// Returns counts of embedded vs unembedded homilies and env var presence.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("homilies")
    .select("id, embedding_thread, embedding_notes, embedding_content")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const total = rows.length;
  const withAnyEmbedding = rows.filter(
    (r) => r.embedding_thread || r.embedding_notes || r.embedding_content
  ).length;

  return NextResponse.json({
    openaiKeyPresent: !!process.env.OPENAI_API_KEY,
    anthropicKeyPresent: !!process.env.ANTHROPIC_API_KEY,
    totalHomilies: total,
    withEmbeddings: withAnyEmbedding,
    withoutEmbeddings: total - withAnyEmbedding,
  });
}
