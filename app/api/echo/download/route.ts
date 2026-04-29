// POST /api/echo/download
//
// Generates a polished .docx file from an Echo output and returns it as a binary blob.
//
// Request body:
//   {
//     text:        string   — the Echo output text (plain text, \n\n between paragraphs)
//     outputType:  string   — one of the five Echo output types
//     attribution: string   — e.g. "From a homily preached on the Fifth Sunday of Easter..."
//   }
//
// Response: application/vnd.openxmlformats-officedocument.wordprocessingml.document

import { NextRequest } from "next/server";
import JSZip from "jszip";

// ── Per-type document titles ──────────────────────────────────────────────
const OUTPUT_TITLES: Record<string, string | null> = {
  "take-into-the-week":    "A Thought for the Week",
  "parish-reflection":     null,   // body stands alone
  "social-post":           null,
  "small-group-questions": "Discussion Questions",
  "prayer-prompt":         "A Prayer for the Week",
};

// ── XML helpers ───────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  /** half-points: 24 = 12 pt, 28 = 14 pt, 20 = 10 pt */
  size?: number;
  /** hex colour without #, e.g. "888888" */
  color?: string;
}

interface ParaOpts extends RunOpts {
  /** "left" | "center" | "both" */
  align?: string;
  /** twips (1 pt = 20 twips) */
  spaceBefore?: number;
  spaceAfter?: number;
  /** line spacing in 240ths per line: 276 ≈ 1.15×, 360 = 1.5× */
  lineSpacing?: number;
}

/** Build a <w:p> element. Handles \n as soft line-breaks within the paragraph. */
function buildPara(text: string, opts: ParaOpts = {}): string {
  const {
    bold, italic, size = 24, color,
    align = "both", spaceBefore, spaceAfter = 120, lineSpacing = 360,
  } = opts;

  // Paragraph properties
  const pprParts: string[] = [`<w:jc w:val="${align}"/>`];
  const spacingAttrs: string[] = [`w:after="${spaceAfter}"`, `w:line="${lineSpacing}"`, `w:lineRule="auto"`];
  if (spaceBefore !== undefined) spacingAttrs.push(`w:before="${spaceBefore}"`);
  pprParts.push(`<w:spacing ${spacingAttrs.join(" ")}/>`);
  const ppr = `<w:pPr>${pprParts.join("")}</w:pPr>`;

  // Run properties (applied to every run in this paragraph)
  const rprParts: string[] = [
    `<w:rFonts w:ascii="Garamond" w:hAnsi="Garamond" w:cs="Garamond"/>`,
    `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
  ];
  if (bold) rprParts.push("<w:b/><w:bCs/>");
  if (italic) rprParts.push("<w:i/><w:iCs/>");
  if (color) rprParts.push(`<w:color w:val="${color}"/>`);
  const rpr = `<w:rPr>${rprParts.join("")}</w:rPr>`;

  // Split on \n for soft line-breaks within the paragraph
  const lines = text.split("\n");
  const runs = lines
    .map((line, i) => {
      const t = `<w:t xml:space="preserve">${esc(line)}</w:t>`;
      const run = `<w:r>${rpr}${t}</w:r>`;
      if (i < lines.length - 1) {
        return run + `<w:r>${rpr}<w:br/></w:r>`;
      }
      return run;
    })
    .join("");

  return `<w:p>${ppr}${runs}</w:p>`;
}

// ── Static DOCX files ─────────────────────────────────────────────────────

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

// Defines global document defaults — Garamond 12pt, justified, 1.5× line spacing
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Garamond" w:hAnsi="Garamond" w:cs="Garamond"/>
        <w:sz w:val="24"/><w:szCs w:val="24"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:jc w:val="both"/>
        <w:spacing w:after="120" w:line="360" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="720"/>
</w:settings>`;

// ── Document builder ──────────────────────────────────────────────────────

function buildDocumentXml(text: string, outputType: string, attribution: string): string {
  const title = OUTPUT_TITLES[outputType] ?? null;

  // Split body into paragraphs on blank lines
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const titleXml = title
    ? buildPara(title, {
        bold: true, size: 28, align: "center",
        spaceBefore: 0, spaceAfter: 280, lineSpacing: 276,
      })
    : "";

  const bodyXml = paragraphs
    .map((p) =>
      buildPara(p, { size: 24, align: "both", spaceAfter: 160, lineSpacing: 360 })
    )
    .join("");

  const attributionXml = buildPara(attribution, {
    italic: true, size: 20, color: "7A7A7A",
    align: "left", spaceBefore: 480, spaceAfter: 0, lineSpacing: 276,
  });

  // A4 page size, 1.25 in left/right margins, 1 in top/bottom
  const sectPr = `<w:sectPr>
    <w:pgSz w:w="11906" w:h="16838"/>
    <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="720" w:footer="720" w:gutter="0"/>
  </w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${titleXml}${bodyXml}${attributionXml}
    ${sectPr}
  </w:body>
</w:document>`;
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { text, outputType, attribution } = await req.json() as {
      text: string;
      outputType: string;
      attribution: string;
    };

    if (!text || !outputType || !attribution) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const documentXml = buildDocumentXml(text, outputType, attribution);

    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("_rels/.rels", ROOT_RELS);
    zip.file("word/document.xml", documentXml);
    zip.file("word/_rels/document.xml.rels", WORD_RELS);
    zip.file("word/styles.xml", STYLES);
    zip.file("word/settings.xml", SETTINGS);

    // generateAsync with "arraybuffer" gives a plain ArrayBuffer — valid BodyInit in all envs
    const arrayBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });

    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[echo/download] error:", err);
    return Response.json({ error: "Failed to generate document" }, { status: 500 });
  }
}
