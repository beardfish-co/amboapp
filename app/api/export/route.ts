// app/api/export/route.ts
// Generates a ZIP archive of all the priest's homilies as individual PDFs.
// Called from the AccountMenu — returns application/zip for direct download.
// Runs on the Node.js runtime (pdfkit requires Node streams).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import PDFDocument from "pdfkit";
import JSZip from "jszip";

export const runtime = "nodejs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Homily {
  id: string;
  title: string | null;
  content: string | null;
  sunday_date: string | null;
  created_at: string;
  updated_at: string;
}

// ── HTML → plain text ─────────────────────────────────────────────────────────

interface TextBlock {
  type: "para" | "quote";
  text: string;
}

function htmlToBlocks(html: string | null): TextBlock[] {
  if (!html) return [];
  const blocks: TextBlock[] = [];
  let src = html.replace(/\r\n?/g, "\n").replace(/\t/g, " ");

  src = src.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const text = stripTags(inner).trim();
    if (text) blocks.push({ type: "quote", text });
    return "";
  });

  const parts = src.split(/<\/?p[^>]*>/i);
  for (const part of parts) {
    const text = stripTags(part).trim();
    if (text) blocks.push({ type: "para", text });
  }

  return blocks;
}

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&#x2019;/g, "’")
    .replace(/&#x2018;/g, "‘")
    .replace(/&#x201C;/g, "“")
    .replace(/&#x201D;/g, "”")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Date formatting ───────────────────────────────────────────────────────────

function formatSundayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function safeFilename(title: string | null, date: string | null): string {
  const prefix = date ?? "undated";
  const name = (title ?? "Untitled")
    .replace(/[^a-zA-Z0-9 \-']/g, "")
    .trim()
    .slice(0, 60);
  return `${prefix} ${name}.pdf`;
}

// ── PDF generation ────────────────────────────────────────────────────────────

function generatePDF(homily: Homily): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 72,
      info: {
        Title: homily.title ?? "Homily",
        Author: "Ambo",
        Creator: "Ambo — amboapp.com",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 144;

    // Wordmark
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#8A96A3")
      .text("Ambo", 72, 72, { width: pageWidth, align: "right" });

    doc
      .moveTo(72, 86)
      .lineTo(72 + pageWidth, 86)
      .strokeColor("#D8DDE8")
      .lineWidth(0.5)
      .stroke();

    doc.moveDown(2);

    // Title
    const title = homily.title?.trim() || "Untitled Homily";
    doc
      .fontSize(24)
      .font("Helvetica-Bold")
      .fillColor("#273548")
      .text(title, 72, doc.y, { width: pageWidth });

    doc.moveDown(0.5);

    // Date
    if (homily.sunday_date) {
      doc
        .fontSize(12)
        .font("Helvetica-Oblique")
        .fillColor("#5F6D7C")
        .text(formatSundayDate(homily.sunday_date), { width: pageWidth });
    }

    doc.moveDown(1.5);

    doc
      .moveTo(72, doc.y)
      .lineTo(72 + pageWidth, doc.y)
      .strokeColor("#D8DDE8")
      .lineWidth(0.5)
      .stroke();

    doc.moveDown(1.5);

    // Body
    if (!homily.content || homily.content.trim() === "" || homily.content === "<p></p>") {
      doc
        .fontSize(12)
        .font("Helvetica-Oblique")
        .fillColor("#8A96A3")
        .text("(no content)", { width: pageWidth });
    } else {
      const blocks = htmlToBlocks(homily.content);
      for (const block of blocks) {
        if (block.type === "quote") {
          const qx = 72 + 20;
          const qw = pageWidth - 20;
          const qy = doc.y;
          doc
            .fontSize(12)
            .font("Helvetica-Oblique")
            .fillColor("#273548")
            .text(block.text, qx, qy, { width: qw });
          const afterY = doc.y;
          doc
            .moveTo(72 + 6, qy)
            .lineTo(72 + 6, afterY)
            .strokeColor("#4A6FA5")
            .lineWidth(2)
            .stroke();
          doc.moveDown(0.8);
        } else {
          doc
            .fontSize(13)
            .font("Helvetica")
            .fillColor("#273548")
            .text(block.text, 72, doc.y, { width: pageWidth, lineGap: 3 });
          doc.moveDown(0.8);
        }
      }
    }

    // Footer
    const footerY = doc.page.height - 60;
    doc
      .moveTo(72, footerY)
      .lineTo(72 + pageWidth, footerY)
      .strokeColor("#D8DDE8")
      .lineWidth(0.5)
      .stroke();

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#8A96A3")
      .text("Exported from Ambo", 72, footerY + 8, { width: pageWidth / 2 });

    const exportDate = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    doc.text(exportDate, 72 + pageWidth / 2, footerY + 8, {
      width: pageWidth / 2,
      align: "right",
    });

    doc.end();
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: homilies, error } = await supabase
      .from("homilies")
      .select("id, title, content, sunday_date, created_at, updated_at")
      .eq("user_id", user.id)
      .order("sunday_date", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("[export] DB error:", error.message);
      return NextResponse.json({ error: "Failed to load homilies" }, { status: 500 });
    }

    if (!homilies || homilies.length === 0) {
      return NextResponse.json({ error: "No homilies to export" }, { status: 404 });
    }

    const zip = new JSZip();
    const folder = zip.folder("Ambo Homilies")!;

    for (const homily of homilies as Homily[]) {
      const pdf = await generatePDF(homily);
      const filename = safeFilename(homily.title, homily.sunday_date);
      folder.file(filename, pdf);
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const exportDate = new Date().toISOString().slice(0, 10);
    const zipFilename = `ambo-homilies-${exportDate}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Content-Length": String(zipBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[export] Unexpected error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
