// POST /api/embed-homily
//
// Background embedding endpoint. Called fire-and-forget after any save in
// Write or Reflect. Generates OpenAI embeddings for the changed content
// layers and writes them back to Supabase.
//
// Request body:
//   { id: string, layers: Array<"thread"|"followups"|"notes"|"content"|"all"> }
//
// The "all" shorthand re-embeds every layer — used by the backfill trigger.
//
// Auth: requires signed-in user (session cookie). Uses admin client for the
// Supabase write so it can bypass RLS on the embedding columns.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateEmbedding,
  stripHtml,
  buildFollowupsText,
} from "@/lib/embeddings";

export type EmbedLayer = "thread" | "followups" | "notes" | "content";

interface RequestBody {
  id: string;
  layers: Array<EmbedLayer | "all">;
}

interface HomilyRow {
  id: string;
  user_id: string;
  seed: string | null;
  seed_why_now: string | null;
  seed_eucharist: string | null;
  seed_response: string | null;
  notes: string | null;
  content: string | null;
}

export async function POST(req: NextRequest) {
  // Verify the caller is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, layers } = body;
  if (!id || !Array.isArray(layers) || layers.length === 0) {
    return NextResponse.json({ error: "Missing id or layers" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the homily (verify it belongs to this user)
  const { data: homily, error: fetchErr } = await admin
    .from("homilies")
    .select("id, user_id, seed, seed_why_now, seed_eucharist, seed_response, notes, content")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<HomilyRow>();

  if (fetchErr || !homily) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const targetLayers: EmbedLayer[] = layers.includes("all")
    ? ["thread", "followups", "notes", "content"]
    : (layers.filter((l) => l !== "all") as EmbedLayer[]);

  const updates: Record<string, number[] | null> = {};
  const results: Record<string, "ok" | "empty" | "error"> = {};

  for (const layer of targetLayers) {
    try {
      let text = "";
      switch (layer) {
        case "thread":
          text = homily.seed?.trim() ?? "";
          break;
        case "followups":
          text = buildFollowupsText(homily.seed_why_now, homily.seed_eucharist, homily.seed_response);
          break;
        case "notes":
          text = homily.notes?.trim() ?? "";
          break;
        case "content":
          text = stripHtml(homily.content);
          break;
      }

      if (!text) {
        updates[`embedding_${layer}`] = null;
        results[layer] = "empty";
        continue;
      }

      const embedding = await generateEmbedding(text);
      updates[`embedding_${layer}`] = embedding;
      results[layer] = embedding ? "ok" : "error";
    } catch (err) {
      console.error(`[embed-homily] Layer ${layer} failed:`, err);
      results[layer] = "error";
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await admin
      .from("homilies")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("[embed-homily] Supabase update failed:", updateErr.message);
      return NextResponse.json({ error: "DB write failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ id, results });
}
