// lib/embeddings.ts
//
// OpenAI text-embedding-3-small utility for the Ambo search pipeline.
// Used by:
//   - /api/embed-homily  (background embedding on save)
//   - /api/search-homilies (embed the query's thematic component)
//
// text-embedding-3-small produces 1536-dimensional vectors.
// Average cost: ~$0.00002 per 1000 tokens (~0.00002 per ~750 words).
// A full homily is typically 800–1500 words → < $0.00005 per embed.

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

export { EMBEDDING_DIMENSIONS };

/**
 * Generate an embedding vector for a given text string.
 * Returns null if the text is empty or the API call fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[embeddings] OPENAI_API_KEY not set");
    return null;
  }

  const cleaned = text.trim();
  if (!cleaned) return null;

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: cleaned.slice(0, 8000), // well within token limit
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    console.error(`[embeddings] OpenAI error ${res.status}: ${err}`);
    return null;
  }

  const data = await res.json() as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0]?.embedding ?? null;
}

/**
 * Strip HTML tags and normalise whitespace.
 * Used before embedding the `content` layer (which is stored as HTML).
 */
export function stripHtml(html: string | null): string {
  if (!html) return "";
  return html
    // Block-level elements become newlines so paragraph splitting works
    .replace(/<\/?(p|div|li|h[1-6]|blockquote|section|article)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>\s*/gi, "\n")
    // Strip remaining inline tags
    .replace(/<[^>]+>/g, "")
    // HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&#x2019;/g, "'")
    .replace(/&lsquo;|&#x2018;/g, "'")
    .replace(/&rdquo;|&#x201D;/g, "\u201d")
    .replace(/&ldquo;|&#x201C;/g, "\u201c")
    // Collapse horizontal whitespace but preserve newlines
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

/**
 * Combine the three follow-up answer fields into a single string for embedding.
 * We embed them together because they form a single semantic unit.
 */
export function buildFollowupsText(
  whyNow: string | null,
  eucharist: string | null,
  response: string | null,
): string {
  return [whyNow, eucharist, response]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Find the best excerpt from a plain-text content layer.
 * Splits into paragraphs/sentences and returns the first substantive one
 * (> 40 chars). Falls back to the first 280 chars if nothing qualifies.
 */
export function findExcerpt(text: string, query?: string, maxLength = 280): string {
  if (!text) return "";
  const paras = text.split(/\n+/).map((s) => s.trim()).filter((p) => p.length > 20);
  if (paras.length === 0) return "";

  if (query) {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    if (terms.length > 0) {
      let bestPara = "";
      let bestScore = 0;
      for (const para of paras) {
        const lower = para.toLowerCase();
        const score = terms.filter((t) => lower.includes(t)).length;
        if (score > bestScore) { bestScore = score; bestPara = para; }
      }
      if (bestPara && bestScore > 0) {
        if (bestPara.length <= maxLength) return bestPara;
        const cut = bestPara.lastIndexOf(" ", maxLength);
        return bestPara.slice(0, cut > 0 ? cut : maxLength) + "…";
      }
      // Query provided but no terms matched — return empty string.
      // The caller (extractExcerptWithLayer) decides whether to show a fallback
      // or exclude the result. We must NOT fall through to the first-paragraph
      // fallback here, because that is what causes irrelevant opening lines to
      // appear as excerpts for weak matches (spec §6: show only matched chunks).
      return "";
    }
  }

  // No query (or zero meaningful terms): return the first substantial paragraph.
  // This path is taken deliberately when the caller passes query=undefined,
  // which is the explicit "give me any excerpt" signal for STRONG matches.
  const substantial = paras.find((p) => p.length > 40) ?? paras[0];
  if (substantial.length <= maxLength) return substantial;
  const cut = substantial.lastIndexOf(" ", maxLength);
  return substantial.slice(0, cut > 0 ? cut : maxLength) + "…";
}

/**
 * Returns true if at least one meaningful query term (length > 2) appears
 * in the plain-text content. Used as a secondary gate for weak similarity
 * matches: if the score is below STRONG_THRESHOLD and no term appears in
 * the text, the result is excluded (no matched chunk → no result).
 */
export function hasTermMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  return terms.some((t) => lower.includes(t));
}

