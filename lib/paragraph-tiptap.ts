// Paragraph[] <-> Tiptap converters for the Write surface.
//
// On load:  content string -> parseParagraphs (in WriteView) -> Paragraph[]
//           -> paragraphsToHtml -> Tiptap initial content.
// On save:  editor.getJSON() -> paragraphsFromDoc -> Paragraph[]
//           -> joinParagraphs (in WriteView) -> content string -> DB.
//
// Storage stays in the existing Ambo markdown dialect (paragraphs separated
// by \n\n; '> ' lines for quotes; trailing '— Citation' line inside a quote
// is the citation). No DB migration needed.
//
// Inline marks survive the round trip:
//   **bold** <-> <strong>
//   *italic* <-> <em>
//   ***both*** <-> <strong><em>
//
// PreachView's renderInline already handles **bold** and *italic*; nested
// bold+italic renders as bold-only there (existing limitation). We still
// preserve both marks in the editor across reloads.

import type { JSONContent } from "@tiptap/core";

export type Paragraph = {
  id: string;
  text: string;
  kind?: "quote";
  citation?: string;
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// --- Paragraph[] -> HTML ---------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Mirror lib/inline-markdown.tsx: markers must enclose non-space chars.
const BOLD = /\*\*(\S(?:.*?\S)?)\*\*/;
const ITALIC = /\*(\S(?:.*?\S)?)\*/;

function italicToHtml(text: string): string {
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const m = remaining.match(ITALIC);
    if (!m || m.index === undefined) {
      out.push(escapeHtml(remaining));
      break;
    }
    if (m.index > 0) out.push(escapeHtml(remaining.slice(0, m.index)));
    out.push(`<em>${escapeHtml(m[1])}</em>`);
    remaining = remaining.slice(m.index + m[0].length);
  }
  return out.join("");
}

function inlineToHtml(text: string): string {
  // Bold first, then italic inside each surviving segment — same order as
  // renderInline. Nested italic inside bold survives because we keep parsing
  // italic on the captured bold inner text.
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const m = remaining.match(BOLD);
    if (!m || m.index === undefined) {
      out.push(italicToHtml(remaining));
      break;
    }
    if (m.index > 0) out.push(italicToHtml(remaining.slice(0, m.index)));
    out.push(`<strong>${italicToHtml(m[1])}</strong>`);
    remaining = remaining.slice(m.index + m[0].length);
  }
  return out.join("");
}

export function paragraphsToHtml(paragraphs: Paragraph[]): string {
  if (paragraphs.length === 0) return "<p></p>";
  return paragraphs
    .map((p) => {
      if (p.kind === "quote") {
        const lines = (p.text ?? "").split("\n");
        const bodyHtml = lines
          .map((line) => `<p>${inlineToHtml(line)}</p>`)
          .join("");
        const citationHtml = p.citation
          ? `<p>— ${inlineToHtml(p.citation)}</p>`
          : "";
        return `<blockquote>${bodyHtml}${citationHtml}</blockquote>`;
      }
      if (p.text === "") return "<p></p>";
      return `<p>${inlineToHtml(p.text)}</p>`;
    })
    .join("");
}

// --- Tiptap doc -> Paragraph[] --------------------------------------------

// Walk a paragraph node's inline content and reconstruct **bold** / *italic*
// markers. Edge whitespace is split outside the markers so renderInline's
// non-space boundary regex still matches on the round trip.
function inlineFromDoc(content: JSONContent[] | undefined): string {
  if (!content) return "";
  const parts: string[] = [];
  for (const node of content) {
    if (node.type === "hardBreak") {
      parts.push("\n");
      continue;
    }
    if (node.type === "text") {
      const text = node.text ?? "";
      if (text.length === 0) continue;
      const marks = node.marks ?? [];
      const bold = marks.some((m) => m.type === "bold");
      const italic = marks.some((m) => m.type === "italic");
      if (!bold && !italic) {
        parts.push(text);
        continue;
      }
      const leadMatch = text.match(/^\s+/);
      const trailMatch = text.match(/\s+$/);
      const lead = leadMatch ? leadMatch[0] : "";
      const trail = trailMatch ? trailMatch[0] : "";
      const middle = text.slice(lead.length, text.length - trail.length);
      if (middle.length === 0) {
        parts.push(text);
        continue;
      }
      const open = (bold ? "**" : "") + (italic ? "*" : "");
      const close = (italic ? "*" : "") + (bold ? "**" : "");
      parts.push(lead + open + middle + close + trail);
      continue;
    }
    // Unknown inline node — fall back to its content if any.
    parts.push(inlineFromDoc(node.content));
  }
  return parts.join("");
}

function paragraphNodeText(node: JSONContent): string {
  return inlineFromDoc(node.content);
}

export function paragraphsFromDoc(doc: JSONContent): Paragraph[] {
  const blocks = doc.content ?? [];
  const out: Paragraph[] = [];
  for (const block of blocks) {
    if (block.type === "blockquote") {
      const children = block.content ?? [];
      const lines: string[] = children.map((c) =>
        c.type === "paragraph" ? paragraphNodeText(c) : ""
      );
      let citation: string | undefined;
      if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
        citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
        lines.pop();
      }
      const text = lines.join("\n").trim();
      out.push({
        id: generateId(),
        text,
        kind: "quote" as const,
        ...(citation !== undefined ? { citation } : {}),
      });
      continue;
    }
    if (block.type === "paragraph") {
      out.push({ id: generateId(), text: paragraphNodeText(block) });
      continue;
    }
    // Unknown block — preserve whatever text it carries as a body paragraph.
    out.push({ id: generateId(), text: paragraphNodeText(block) });
  }
  if (out.length === 0) out.push({ id: generateId(), text: "" });
  return out;
}
