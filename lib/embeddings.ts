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
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&#x2019;/g, "'")
    .replace(/&lsquo;|&#x2018;/g, "'")
    .replace(/&rdquo;|&#x201D;/g, "”")
    .replace(/&ldquo;|&#x201C;/g, "“")
    .replace(/\s+/g, " ")
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
  }

  const substantial = paras.find((p) => p.length > 40) ?? paras[0];
  if (substantial.length <= maxLength) return substantial;
  const cut = substantial.lastIndexOf(" ", maxLength);
  return substantial.slice(0, cut > 0 ? cut : maxLength) + "…";
}
