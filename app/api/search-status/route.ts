// GET /api/search-status
// Diagnostic endpoint — checks embedding readiness for the signed-in user.
// Returns counts of embedded vs unembedded homilies and env var presence.

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  void req;
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

  // Re-queue ALL homilies for embedding (forces regeneration with correct format)
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  let requeued = 0;
  for (const row of rows) {
    try {
      await fetch(`${baseUrl}/api/embed-homily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, layers: ["all"] }),
      });
      requeued++;
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    openaiKeyPresent: !!process.env.OPENAI_API_KEY,
    anthropicKeyPresent: !!process.env.ANTHROPIC_API_KEY,
    totalHomilies: total,
    withEmbeddings: withAnyEmbedding,
    withoutEmbeddings: total - withAnyEmbedding,
    requeued,
  });
}
