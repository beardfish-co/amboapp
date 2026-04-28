// GET /api/search-status
// Diagnostic endpoint — checks embedding readiness for the signed-in user.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("homilies")
    .select("id, title, embedding_thread, embedding_notes, embedding_content")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const withAny = rows.filter(
    (r) => r.embedding_thread || r.embedding_notes || r.embedding_content
  );

  return NextResponse.json({
    openaiKeyPresent: !!process.env.OPENAI_API_KEY,
    anthropicKeyPresent: !!process.env.ANTHROPIC_API_KEY,
    totalHomilies: rows.length,
    withEmbeddings: withAny.length,
    withoutEmbeddings: rows.length - withAny.length,
    homilies: rows.map((r) => ({
      id: r.id,
      title: r.title,
      hasThread: !!r.embedding_thread,
      hasNotes: !!r.embedding_notes,
      hasContent: !!r.embedding_content,
    })),
  });
}
