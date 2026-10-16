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
  return `The Gospel reading is ${gospelRef}${dayName ? ` (${dayName})` : ""}. Provide 3 to 4 citations from Church teaching for a priest preparing a homily on this passage.`;
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

// ── Presentation: verified teaching points ─────────────────────────────────
//
// The answer prose (content_raw) is a short list of points, each ending in
// footnote markers like [^5]. Marker n refers to citations[n-1]. The
// `citations` array is Magisterium's whole retrieval set, most of which the
// answer never uses, so we only show citations a point actually cites.
//
// For each point we return the Church's own words: the key sentence from
// the cited passage (the one closest to the point being made), plus the
// surrounding sentences for "more of this passage", and a link to the source.
// Non-English passages are dropped (decision, Oct 2026).

export interface TeachingPoint {
  theme: string;        // short bold lead, e.g. "Citizenship carries real duties."
  before: string;       // sentences before the lead, verbatim, may be ""
  lead: string;         // key sentence(s), verbatim from the source
  after: string;        // sentences after the lead, verbatim, may be ""
  sourceLabel: string;  // e.g. "Catechism of the Catholic Church · §2240"
  sourceUrl: string;
}

const LEAD_MAX = 360;     // characters: one or two sentences
const BEFORE_MAX = 450;   // characters of context shown before the lead
const AFTER_MAX = 700;    // characters of context shown after it

const STOPWORDS_EN = new Set([
  "the", "and", "of", "to", "in", "is", "that", "for", "with", "as", "be",
  "which", "his", "by", "it", "not", "are", "this", "from", "who", "we", "our",
]);

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanPassage(text: string): string {
  // Drop heading paragraphs (a markdown heading can wrap over several lines).
  const body = decodeEntities(text)
    .split(/\n\s*\n/)
    .filter((para) => !/^\s*#{1,6}\s/.test(para))
    .join("\n\n");
  return body
    .replace(/^\s*\[\^\w+\]:.*$/gm, "")        // footnote definitions
    .replace(/\[\^\w+\]/g, "")                 // footnote markers
    .replace(/^\s*#{1,6}\s.*$/gm, "")          // markdown headings
    .replace(/^\s*-{3,}\s*$/gm, "")            // rules
    .replace(/\b\d{4}\s+Dz\s+\d+\s*/g, "")     // Denzinger numbering "3152 Dz 1857"
    .replace(/\s+/g, " ")
    .replace(/^\s*\d{1,4}\.\s+/, "")           // leading paragraph number "102. "
    .replace(/\s+\d{1,2}\.\s+(?=[A-Z])/g, " ") // inline section numbers " 2. Con"
    .trim();
}

function isEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  if (words.length < 8) return true;
  const hits = words.filter((w) => STOPWORDS_EN.has(w)).length;
  return hits / words.length > 0.12;
}

// Abbreviations common in Church documents that end in a full stop but do
// not end a sentence ("Cfr. Io. 18, 37", "St. Augustine").
const ABBREV = /(?:\b(?:Cfr|Cf|cf|Luc|Lk|Io|Jn|Marc|Mk|Matt|Mt|Ibid|ibid|Congr|St|Sts|Pp|nn?|No|Ac|Rom|Cor|Gal|Eph|Phil|Col|Heb|Ps|Is|Jer|Gen|Ex|Dt|Fr|Mgr|Dr|vol|art|cap|ch|op|cit)\.)$/;

function splitSentences(text: string): string[] {
  // Split after . ! ? (optionally followed by a closing quote), and after a
  // closing citation parenthesis "(Luc. 20, 22)", before a capital, an
  // opening quote or a bracket.
  const rough = text
    .split(/(?<=[.!?][”"’)\]]?|\))\s+(?=[“"‘(\[]?[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Re-join pieces that were split after an abbreviation.
  const out: string[] = [];
  for (const piece of rough) {
    if (out.length && ABBREV.test(out[out.length - 1])) out[out.length - 1] += ` ${piece}`;
    else out.push(piece);
  }
  return out;
}

function contentWords(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().match(/[a-z']+/g) ?? [])
      .filter((w) => w.length > 3 && !STOPWORDS_EN.has(w))
      .map((w) => w.slice(0, 5)), // crude stem: "distinction" ~ "distinguish"
  );
}

function pickPassage(
  passage: string,
  pointText: string,
): { before: string; lead: string; after: string } {
  const sentences = splitSentences(passage);
  if (sentences.length === 0) return { before: "", lead: "", after: "" };

  const target = contentWords(pointText);
  let best = 0;
  let bestScore = -1;
  sentences.forEach((s, i) => {
    const words = contentWords(s);
    let score = 0;
    words.forEach((w) => { if (target.has(w)) score++; });
    if (s.length > 600) score -= 2; // avoid run-on chunks as the lead
    if (score > bestScore) { bestScore = score; best = i; }
  });

  // Lead: best sentence, plus the next one if the first is short.
  let end = best + 1;
  let lead = sentences[best];
  if (lead.length < 140 && end < sentences.length && lead.length + sentences[end].length < LEAD_MAX) {
    lead = `${lead} ${sentences[end]}`;
    end++;
  }

  // Context in reading order: a little before, more after.
  const before: string[] = [];
  let len = 0;
  for (let i = best - 1; i >= 0 && len + sentences[i].length <= BEFORE_MAX; i--) {
    before.unshift(sentences[i]);
    len += sentences[i].length;
  }
  const after: string[] = [];
  len = 0;
  for (let i = end; i < sentences.length && len + sentences[i].length <= AFTER_MAX; i++) {
    after.push(sentences[i]);
    len += sentences[i].length;
  }

  const tidy = (t: string) => t.replace(/\s*(?:\.\s){2,}\.?\s*$/, "").trim(); // trailing ". . ."
  return { before: tidy(before.join(" ")), lead: tidy(lead), after: tidy(after.join(" ")) };
}

function sourceLabel(c: MagisteriumCitation): string {
  const title = (c.document_title ?? "").trim();
  const author = (c.document_author ?? "").replace(/^Pope\s+/i, "").trim();
  const ref = (c.document_reference ?? "").trim();
  const numericRef = /^(para-)?\d+$/.test(ref) ? ref.replace(/^para-/, "") : "";

  if (/Catechism of the Catholic Church/i.test(title)) {
    return numericRef ? `Catechism of the Catholic Church · §${numericRef}` : "Catechism of the Catholic Church";
  }

  if (/Enchiridion|Sources of Catholic Dogma/i.test(title)) {
    const heading = (c.cited_text_heading ?? "").replace(/\s+/g, " ");
    const m = heading.match(/["“]([^"”]+?),?["”],?\s*(?:[A-Z][a-z]+\s+\d{1,2},\s*)?(\d{4})/);
    const doc = m ? `${m[1]}, ${m[2]}` : heading.replace(/^.*?From the\s+/i, "") || "Enchiridion Symbolorum";
    return numericRef ? `${doc} · DH ${numericRef}` : doc;
  }

  // Vatican-site style titles: "9 October 1989: Holy Mass in … - Homily"
  const dated = title.match(/^(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}):\s.*?\s-\s([A-Z][A-Za-z ]+)$/);
  const cleanTitle = dated ? `${dated[2]}, ${dated[1]}` : title.replace(/"/g, "");
  const parts = [author, cleanTitle].filter(Boolean);
  let label = parts.join(" · ");
  if (numericRef) label += ` · §${numericRef}`;
  return label || "Source";
}

function firstSentence(s: string): string {
  const first = splitSentences(s)[0] ?? "";
  return first.length > 220 ? "" : first;
}

export function buildTeachingPoints(
  contentRaw: string | null | undefined,
  citations: MagisteriumCitation[] | null | undefined,
): TeachingPoint[] {
  if (!contentRaw || !citations?.length) return [];

  const blocks = contentRaw
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => /\[\^\d+\]/.test(b));

  const points: TeachingPoint[] = [];
  const usedDocs = new Set<number>();

  for (const block of blocks) {
    const markers = [...block.matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1]) - 1);
    const text = block
      .replace(/\[\^\w+\]/g, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^>\s?/gm, "")
      .trim();

    const boldMatch = text.match(/^\*\*(.+?)\*\*\s*/);
    const theme = boldMatch ? boldMatch[1].trim() : "";
    const rest = (boldMatch ? text.slice(boldMatch[0].length) : text)
      .replace(/\*\*/g, "").replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1").trim();

    // First cited source that is English and not already shown.
    for (const idx of markers) {
      const c = citations[idx];
      if (!c || usedDocs.has(idx)) continue;
      const passage = cleanPassage(c.cited_text);
      if (passage.length < 40 || !isEnglish(passage)) continue;

      const { before, lead, after } = pickPassage(passage, `${theme} ${rest}`);
      if (!lead) continue;

      usedDocs.add(idx);
      points.push({
        theme: theme || firstSentence(rest) || "From the Church’s teaching",
        before,
        lead,
        after,
        sourceLabel: sourceLabel(c),
        sourceUrl: c.source_url,
      });
      break;
    }
  }

  return points;
}
