// POST /api/search-homilies
//
// Natural-language search over a priest's homily archive. The client sends
// the user's query together with brief summaries of all their homilies.
// Claude ranks the summaries by relevance and returns an ordered list of IDs.
//
// This is a lightweight approach that needs no embedding infrastructure —
// priests typically have a small archive (< 200 homilies), so a single
// prompt call is fast and cheap.
//
// Request body:
//   {
//     query: string,
//     homilies: Array<{
//       id: string,
//       title: string | null,
//       sundayName: string | null,
//       sundayDate: string | null,
//       snippet: string,
//     }>
//   }
//
// Response:
//   { ids: string[] }   // ordered by relevance, most relevant first
//
// Auth: requires signed-in user (Supabase session cookie).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

interface HomilyStub {
  id: string;
  title: string | null;
  sundayName: string | null;
  sundayDate: string | null;
  snippet: string;
}

interface RequestBody {
  query: string;
  homilies: HomilyStub[];
}

const SEARCH_MODEL = "claude-haiku-4-5-20251001";
const MAX_HOMILIES = 200;

function buildPrompt(query: string, homilies: HomilyStub[]): string {
  const list = homilies
    .map((h, i) => {
      const label =
        h.title?.trim() ||
        h.sundayName ||
        (h.sundayDate ? "Homily on " + h.sundayDate : "Untitled homily");
      const date = h.sundayDate ?? "";
      const context = h.sundayName
        ? " (" + h.sundayName + (date ? ", " + date : "") + ")"
        : date
        ? " (" + date + ")"
        : "";
      return (
        "[" + (i + 1) + "] ID:" + h.id + "\n" +
        "Title: " + label + context + "\n" +
        "Content: " + (h.snippet || "(empty)")
      );
    })
    .join("\n\n");

  return (
    'You are a search assistant helping a Catholic priest find homilies in his personal archive.\n\n' +
    'The priest\'s query: "' + query + '"\n\n' +
    'Below are summaries of his homilies. Rank ONLY the ones that are relevant to his query, from most to least relevant. Skip homilies that are clearly unrelated.\n\n' +
    list + "\n\n" +
    'Respond with a JSON array of IDs in relevance order, containing only IDs of relevant homilies. Return at most 20 results. Example: ["id-abc", "id-xyz"]\n\n' +
    'Return ONLY the JSON array, nothing else.'
  );
}

export async function POST(req: NextRequest) {
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

  const { query, homilies } = body;

  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }
  if (!Array.isArray(homilies) || homilies.length === 0) {
    return NextResponse.json({ ids: [] });
  }

  const safeHomilies = homilies.slice(0, MAX_HOMILIES);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Search unavailable" },
      { status: 503 },
    );
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: SEARCH_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: buildPrompt(query.trim(), safeHomilies),
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ ids: [] });
    }

    const ids: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(ids)) {
      return NextResponse.json({ ids: [] });
    }

    const validIds = new Set(safeHomilies.map((h) => h.id));
    const filtered = ids.filter(
      (id): id is string => typeof id === "string" && validIds.has(id),
    );

    return NextResponse.json({ ids: filtered });
  } catch (err) {
    console.error("[search-homilies] Claude error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
