// lib/search-parser.ts
//
// Sonnet-based natural language query parser for Ambo search.
//
// Sonnet's ONLY role here is to decompose the priest's query into three
// structured components. It never sees any homily content. It never generates
// summaries, commentary, or answers. Its output is a plain JSON object.
//
// The structured query drives:
//   - thematic  → embedded and run as pgvector similarity search
//   - factual   → converted to date ranges and passed as SQL filters
//   - temporal  → date range SQL filters
//
// If Sonnet fails for any reason, we return a safe fallback: the entire
// query as the thematic component, with no date filters.

import Anthropic from "@anthropic-ai/sdk";

export interface ParsedQuery {
  /** The semantic/thematic content to embed. null if the query is purely factual/temporal. */
  thematic: string | null;
  /** ISO date range derived from factual or temporal expressions. */
  dateRange: {
    from: string | null; // YYYY-MM-DD
    to: string | null;   // YYYY-MM-DD
  } | null;
  /** True if the query appears to be about a specific liturgical day/feast. */
  isFactualLookup: boolean;
}

const PARSER_MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a query parser for a Catholic priest's homily archive search system.

Your ONLY job is to parse the priest's natural-language query into a structured JSON object.

You must NOT:
- Generate any content about homilies
- Summarise, interpret, or comment on anything
- Produce any text other than the JSON object specified below

The current date is provided in the user message. Use it to resolve relative time expressions.

Output ONLY this JSON structure (no markdown, no explanation):
{
  "thematic": string | null,
  "dateRange": { "from": "YYYY-MM-DD" | null, "to": "YYYY-MM-DD" | null } | null,
  "isFactualLookup": boolean
}

Rules:
- "thematic": Extract the semantic/topical content of the query. This is what will be used for similarity search. If the query is purely about a date or liturgical calendar item with no thematic content, set to null.
- "dateRange": If the query contains any temporal expression (e.g. "last year", "this Lent", "the past six months", "Easter 2024", "since Advent"), resolve it to an ISO date range. Use null for from/to if one end is open. Set the entire field to null if no temporal expression is present.
- "isFactualLookup": true if the query is specifically about a named liturgical day, feast, or scripture passage (e.g. "Easter Vigil 2024", "John 21", "Feast of the Assumption").
- Liturgical seasons as date ranges (approximate, adjust year to match context):
  - Advent: ~late November to ~December 24
  - Christmas: December 25 to ~January 12
  - Lent: ~Ash Wednesday (46 days before Easter) to Holy Saturday
  - Easter: Easter Sunday to Pentecost (~50 days)
  - Ordinary Time: all other weeks

Examples:
Query: "homilies on mercy"
Output: {"thematic":"mercy","dateRange":null,"isFactualLookup":false}

Query: "what did I preach during Lent last year"
Output: {"thematic":"Lent preaching","dateRange":{"from":"2025-03-05","to":"2025-04-19"},"isFactualLookup":false}

Query: "Easter Vigil 2024"
Output: {"thematic":null,"dateRange":{"from":"2024-03-30","to":"2024-03-30"},"isFactualLookup":true}

Query: "anything about the prodigal son in the last six months"
Output: {"thematic":"prodigal son","dateRange":{"from":"2025-10-28","to":"2026-04-28"},"isFactualLookup":false}`;

export async function parseSearchQuery(
  query: string,
  today: string, // YYYY-MM-DD
): Promise<ParsedQuery> {
  const fallback: ParsedQuery = {
    thematic: query.trim(),
    dateRange: null,
    isFactualLookup: false,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: PARSER_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Today's date: ${today}\n\nQuery: ${query.trim()}`,
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Extract JSON — Sonnet occasionally wraps in a code fence despite instructions
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ParsedQuery>;

    return {
      thematic: typeof parsed.thematic === "string" ? parsed.thematic || null : fallback.thematic,
      dateRange: parsed.dateRange ?? null,
      isFactualLookup: parsed.isFactualLookup === true,
    };
  } catch (err) {
    console.error("[search-parser] Sonnet error:", err);
    return fallback;
  }
}
