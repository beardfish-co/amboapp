// lib/reranker.ts
//
// Sonnet-based relevance reranker for the Ambo search pipeline.
//
// Role: second-stage gate after paragraph-level vector similarity.
// Sonnet receives [query, paragraph] pairs and answers yes/no on genuine
// relevance. This discriminates cases that are indistinguishable in vector
// space — e.g. "disillusionment" (genuinely relevant to a lost-hope passage)
// vs "Aquinas" (not relevant to an Augustine citation).
//
// Sonnet is shown only a short paragraph and the search query.
// It is strictly forbidden from generating content or theological commentary.
//
// Latency: ~1 second per search (top-3 paragraphs judged in parallel).
// Cost: ~$0.001 per search query (well within acceptable range for occasional use).

import Anthropic from "@anthropic-ai/sdk";

export interface RerankerJudgment {
  relevant: boolean;
  reason: string;
}

const SYSTEM_PROMPT = `You are a relevance filter for a Catholic priest's homily archive search engine.

Your only task: decide whether a paragraph from a homily genuinely relates to the priest's search query.

Rules:
- Reply with exactly one line: "yes: [one sentence reason]" or "no: [one sentence reason]"
- Do not generate content, rephrase the paragraph, or explain theology.
- Judge strictly on what the paragraph actually expresses, not on tangential associations.
- Specific names matter: a paragraph citing Augustine is NOT relevant to a query about Aquinas.
- Thematic concepts matter: a paragraph about lost hope and dashed expectations IS relevant to "disillusionment", even if that exact word is absent.`;

export async function judgeRelevance(
  query: string,
  paragraph: string,
): Promise<RerankerJudgment> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[reranker] ANTHROPIC_API_KEY not set — permissive fallback");
    return { relevant: true, reason: "reranker unavailable" };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 80,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Query: "${query}"\nParagraph: "${paragraph}"\n\nIs this paragraph genuinely relevant to the query?`,
      }],
    });

    const text = (response.content[0]?.type === "text" ? response.content[0].text : "").trim();
    const relevant = /^yes/i.test(text);
    const reason = text.replace(/^(yes|no)\s*[:\-]?\s*/i, "").trim();
    console.log(`[reranker] query="${query.slice(0, 40)}" para="${paragraph.slice(0, 60)}" → ${relevant ? "YES" : "NO"}: ${reason}`);
    return { relevant, reason };
  } catch (err) {
    console.error("[reranker] Sonnet call failed:", err);
    // Fail open — don't exclude results if reranker is unavailable
    return { relevant: true, reason: "reranker error — permissive fallback" };
  }
}

/**
 * Judge the top-N candidate paragraphs for a homily in parallel.
 * Returns the first (highest-scoring) paragraph that Sonnet approves,
 * or null if none pass.
 *
 * @param query     The thematic query string
 * @param candidates Paragraphs sorted by vector score, descending
 * @param topN      Max paragraphs to send to Sonnet (default 3)
 */
export async function findApprovedParagraph(
  query: string,
  candidates: Array<{ text: string; score: number; layer: string }>,
  topN = 3,
): Promise<{ text: string; score: number; layer: string; reason: string } | null> {
  const top = candidates.slice(0, topN);
  if (top.length === 0) return null;

  // Judge all top-N in parallel for minimum latency
  const judgments = await Promise.all(
    top.map((c) => judgeRelevance(query, c.text))
  );

  // Return the highest-scoring paragraph that passed (candidates are sorted desc)
  for (let i = 0; i < top.length; i++) {
    if (judgments[i].relevant) {
      return { ...top[i], reason: judgments[i].reason };
    }
  }

  return null;
}
