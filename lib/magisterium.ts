// Shared Magisterium AI query used by both /api/magisterium (on demand) and
// /api/magisterium/prefetch (weekly cron). One prompt, one parser, so the two
// paths can never drift apart again.
//
// Scope decision (Oct 2026): Magisterium covers CHURCH TEACHING ONLY.
// The Church Fathers are served by the Catena Aurea panel, Aquinas's own
// verse-by-verse selection. Asking Magisterium for patristic citations
// duplicated the Catena (it would even cite "as transmitted in the Catena
// Aurea"), so it is explicitly excluded here.
//
// Citations: the Chat API returns a structured `citations` array alongside
// `choices` (verbatim cited text, document title, author, year, reference
// number, source URL). We store it so the UI can show verified passages with
// a link to read them in context, rather than relying on the model's prose.
// Docs: https://www.magisterium.com/developers/docs/chat/citations
//
// Attribution (Magisterium API Terms §4.5): any UI surfacing this data must
// show "Powered by Magisterium AI". See ReflectView.tsx.

export const MAGISTERIUM_API_URL =
  "https://www.magisterium.com/api/v1/chat/completions";

export const MAGISTERIUM_MODEL = "magisterium-1";

export const SYSTEM_PROMPT = `You are a theological reference assistant for Catholic priests preparing a homily.
Given a Gospel passage, provide 3 to 4 citations from official Church teaching that illuminate the central themes of the passage for preaching.

Source priority — follow this order strictly:
1. Catechism of the Catholic Church (1992) — include at least 2 CCC citations where possible
2. Vatican II documents (1962–1965): Dei Verbum, Lumen Gentium, Gaudium et Spes, Sacrosanctum Concilium, etc.
3. Post-conciliar papal documents: encyclicals, apostolic exhortations (e.g. Evangelii Gaudium, Deus Caritas Est)
4. Earlier papal encyclicals only if directly relevant and no modern source covers the theme

Do not cite the Church Fathers, patristic commentary, or the Catena Aurea. Those are shown to the priest separately.
Do not cite Scripture directly.

For each citation:
- Begin with one short line naming the theme it illuminates.
- Give the direct quotation as a > blockquote, quoted exactly from the document, without stitching fragments together with ellipses.
- Follow with the source and paragraph number in parentheses: (CCC §1234) or (Gaudium et Spes §22).
Separate citations with a blank line. Use **bold** for document titles.
Do not add a title or introduction. Do not end with questions, offers to assist further, or invitations to reply.`;

export function buildUserPrompt(gospelRef: string, dayName: string): string {
  return `The Gospel reading is ${gospelRef} (${dayName}). Provide 3 to 4 citations from Church teaching for a priest preparing a homily on this passage.`;
}

export interface MagisteriumCitation {
  cited_text: string;
  cited_text_heading: string | null;
  document_title: string | null;
  document_index: number;
  document_author: string | null;
  document_year: string | null;
  document_reference: string | null;
  source_url: string;
}

// Strip artefacts that don't belong in the priest's reading pane.
export function cleanContent(raw: string): string {
  return raw
    .replace(/\[\^\w+\]/g, "")            // footnote refs [^1] (sources kept in `citations`)
    .replace(/^Below are[^\n]*\n+/i, "")
    .replace(/^Here are[^\n]*\n+/i, "")
    .replace(/^#{2,3}[^\n]*\n+/, "")       // stray opening title line
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*If you want[^]*$/i, "")
    .replace(/\n*Would you like[^]*$/i, "")
    .replace(/\n*Let me know[^]*$/i, "")
    .trim();
}

function sanitiseCitations(input: unknown): MagisteriumCitation[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .filter((c) => typeof c.cited_text === "string" && typeof c.source_url === "string")
    .map((c) => ({
      cited_text: String(c.cited_text),
      cited_text_heading: typeof c.cited_text_heading === "string" ? c.cited_text_heading : null,
      document_title: typeof c.document_title === "string" ? c.document_title : null,
      document_index: typeof c.document_index === "number" ? c.document_index : 0,
      document_author: typeof c.document_author === "string" ? c.document_author : null,
      document_year: typeof c.document_year === "string" ? c.document_year : null,
      document_reference: typeof c.document_reference === "string" ? c.document_reference : null,
      source_url: String(c.source_url),
    }));
}

export type MagisteriumResult =
  | { ok: true; content: string; contentRaw: string; citations: MagisteriumCitation[] }
  | { ok: false; status: number; error: string };

export async function queryMagisterium(
  gospelRef: string,
  dayName: string,
  apiKey: string,
): Promise<MagisteriumResult> {
  const res = await fetch(MAGISTERIUM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MAGISTERIUM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(gospelRef, dayName) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: errText.slice(0, 500) };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: unknown;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  if (!raw) return { ok: false, status: 502, error: "Empty response from Magisterium AI" };

  return {
    ok: true,
    content: cleanContent(raw),
    contentRaw: raw,
    citations: sanitiseCitations(data.citations),
  };
}
