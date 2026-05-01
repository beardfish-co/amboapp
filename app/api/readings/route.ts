import { NextRequest, NextResponse } from "next/server";

// ── Shared types ───────────────────────────────────────────────────────────────

interface ReadingItem {
  id: string;
  title: string;
  reference: string;
  heading: string;
  text: string;
}

export interface ReadingsPayload {
  date: string;
  number: number;
  /** Liturgical day label, e.g. "Friday of the Fourth Week of Easter" */
  dayName: string;
  /** Saint name for the day, where applicable. Empty string on feria days. */
  saint: string;
  source: "universalis" | "evangelizo";
  readings: ReadingItem[];
}

type AdapterResult = ReadingsPayload | "not_published" | "unavailable";

// ── HTML helpers — used by Universalis adapter ────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripHtml(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n\n")
    .replace(/<\/(h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse Universalis's `day` HTML field into saint name and liturgical day label.
 *
 * The field can take two forms:
 *   Memorial/feast:  "<b>Saint Athanasius, Bishop, Doctor</b><br/>Friday of the Fourth Week of Easter"
 *   Feria:           "Friday of the Fourth Week of Easter"
 *
 * Returns { saint, dayName } where `saint` is empty on feria days.
 */
function parseUniversalisDay(dayHtml: string): { saint: string; dayName: string } {
  const boldMatch = dayHtml.match(/<b>([\s\S]*?)<\/b>/i);
  if (boldMatch) {
    const saint = stripHtml(boldMatch[1]).trim();
    // The feria label lives after the closing </b> tag (typically after <br/>)
    const afterBold = dayHtml.slice(dayHtml.indexOf("</b>") + 4);
    const dayName = stripHtml(afterBold).trim();
    return { saint, dayName };
  }
  // No <b> tag — ordinary feria
  return { saint: "", dayName: stripHtml(dayHtml).trim() };
}

// ── XML helpers — used by Evangelizo adapter ──────────────────────────────────

function extractCdata(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  return m ? m[1].trim() : "";
}

// Normalise Evangelizo's European citation format to the more familiar colon style.
// "Acts 2,14.36-41." → "Acts 2:14,36-41"
// "Ps 23(22),1-3a." → "Ps 23(22):1-3a"
function normaliseRef(ref: string): string {
  return ref
    .replace(/\.$/, "")                     // drop trailing period
    .replace(/(\d),(\d)/, "$1:$2");         // first comma after digit → colon
}

// ── Universalis adapter ───────────────────────────────────────────────────────
//
// Translation: Jerusalem Bible (Ireland, Australia, NZ, and much of the
// English-speaking world). ESV-CE for Great Britain (but only via the apps/
// programs/downloads — the free JSONP endpoint always returns Jerusalem Bible
// regardless of the URL jurisdiction prefix).
//
// Window: ~3 days past, ~9 days future from today.
//
// Jurisdiction prefix: optional. Supported codes include "australia",
// "europe.england", "europe.ireland", "europe.scotland", "europe.wales",
// "canada", "usa", and many others. When supplied, Universalis serves the
// feast calendar for that jurisdiction — both the feast name and readings may
// differ from the universal calendar.

async function fetchFromUniversalis(date: string, jurisdiction?: string): Promise<AdapterResult> {
  const prefix = jurisdiction ? `/${jurisdiction}` : "";
  const url = `https://universalis.com${prefix}/${date}/jsonpmass.js`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Ambo/1.0 (homily writing app; contact: jonathan@beardfish.co)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return "unavailable";

  const text = await res.text();

  // Universalis returns HTML (not JSONP) when the date is outside their window.
  const jsonMatch = text.match(/^universalisCallback\(([\s\S]*)\);?\s*$/);
  if (!jsonMatch) return "not_published";

  const raw = JSON.parse(jsonMatch[1]);

  // Guard against Universalis silently serving today's readings for out-of-range dates.
  const requestedNum = Number(date);
  if (typeof raw.number === "number" && raw.number !== requestedNum) return "not_published";

  const { saint, dayName } = parseUniversalisDay(raw.day || "");

  const readings: ReadingItem[] = [];

  if (raw.Mass_R1) {
    readings.push({
      id: "r1",
      title: "First Reading",
      reference: stripHtml(raw.Mass_R1.source || ""),
      heading: stripHtml(raw.Mass_R1.heading || ""),
      text: stripHtml(raw.Mass_R1.text || ""),
    });
  }
  if (raw.Mass_Ps) {
    readings.push({
      id: "ps",
      title: "Psalm",
      reference: stripHtml(raw.Mass_Ps.source || ""),
      heading: "",
      text: stripHtml(raw.Mass_Ps.text || ""),
    });
  }
  if (raw.Mass_R2) {
    readings.push({
      id: "r2",
      title: "Second Reading",
      reference: stripHtml(raw.Mass_R2.source || ""),
      heading: stripHtml(raw.Mass_R2.heading || ""),
      text: stripHtml(raw.Mass_R2.text || ""),
    });
  }
  if (raw.Mass_G) {
    readings.push({
      id: "gospel",
      title: "Gospel",
      reference: stripHtml(raw.Mass_G.source || ""),
      heading: stripHtml(raw.Mass_G.heading || ""),
      text: stripHtml(raw.Mass_G.text || ""),
    });
  }

  return {
    date: raw.date || date,
    number: requestedNum,
    dayName,
    saint,
    source: "universalis",
    readings,
  };
}

// ── Evangelizo adapter ────────────────────────────────────────────────────────
//
// Translation: NAB (New American Bible) — the approved lectionary translation
// for the United States, served via a documented public XML API.
//
// Coverage: all English-speaking territories using the Roman Ordinary Calendar
// (lang=AM). The same passages are used worldwide; only the translation differs.
//
// Window: up to 30 days from today. One HTTP call returns all four readings.
//
// Note: Evangelizo does not support jurisdictional calendars. All users receive
// the same universal feria calendar regardless of jurisdiction. The `saint`
// field is an editorial list maintained by Evangelizo and may not precisely match
// the universal Roman Calendar.

async function fetchFromEvangelizo(date: string): Promise<AdapterResult> {
  const url = `https://feed.evangelizo.org/v2/reader.php?date=${date}&type=xml&lang=AM`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Ambo/1.0 (homily writing app; contact: jonathan@beardfish.co)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return "unavailable";

  const xml = await res.text();

  // A missing <evangelizo> block means the date is outside the service window.
  if (!xml.includes("<evangelizo>")) return "not_published";

  // litugic_t gives the liturgical day label. On memorial days it includes
  // the memorial name (e.g. "Memorial of Saint Antoninus, Bishop"); on ordinary
  // ferias it gives the feria only. The `saint` field is a separate plain-text
  // saint name that Evangelizo maintains independently.
  const dayName = extractCdata(xml, "litugic_t");
  const saint = extractCdata(xml, "saint");
  const dateStr = extractCdata(xml, "date") || date;

  const readings: ReadingItem[] = [];

  const r1Text = extractCdata(xml, "reading_text1");
  if (r1Text) {
    readings.push({
      id: "r1",
      title: "First Reading",
      reference: normaliseRef(extractCdata(xml, "reading_text1_st")),
      heading: "",
      text: r1Text,
    });
  }

  const psText = extractCdata(xml, "reading_text2");
  if (psText) {
    readings.push({
      id: "ps",
      title: "Psalm",
      reference: normaliseRef(extractCdata(xml, "reading_text2_st")),
      heading: "",
      text: psText,
    });
  }

  const r2Text = extractCdata(xml, "reading_text3");
  if (r2Text) {
    readings.push({
      id: "r2",
      title: "Second Reading",
      reference: normaliseRef(extractCdata(xml, "reading_text3_st")),
      heading: "",
      text: r2Text,
    });
  }

  const gospelText = extractCdata(xml, "reading_gospel");
  if (gospelText) {
    readings.push({
      id: "gospel",
      title: "Gospel",
      reference: normaliseRef(extractCdata(xml, "reading_gospel_st")),
      heading: "",
      text: gospelText,
    });
  }

  // If nothing came back the date is likely out of range.
  if (readings.length === 0) return "not_published";

  return {
    date: dateStr,
    number: Number(date),
    dayName,
    saint,
    source: "evangelizo",
    readings,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const source = searchParams.get("source") ?? "universalis";
  // Optional Universalis jurisdiction prefix (e.g. "australia", "europe.england", "usa").
  // Ignored for Evangelizo (which has no jurisdiction support).
  const jurisdiction = searchParams.get("jurisdiction") ?? undefined;

  if (!date || !/^\d{8}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date. Use YYYYMMDD format." },
      { status: 400 },
    );
  }

  if (source !== "universalis" && source !== "evangelizo") {
    return NextResponse.json(
      { error: "Invalid source. Use 'universalis' or 'evangelizo'." },
      { status: 400 },
    );
  }

  try {
    const result: AdapterResult =
      source === "evangelizo"
        ? await fetchFromEvangelizo(date)
        : await fetchFromUniversalis(date, jurisdiction);

    if (result === "not_published") {
      return NextResponse.json(
        { error: "Readings not published for this date", code: "not_published" },
        { status: 404 },
      );
    }
    if (result === "unavailable") {
      return NextResponse.json(
        { error: "Failed to fetch readings from source" },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Readings API error:", err);
    return NextResponse.json({ error: "Failed to fetch readings" }, { status: 500 });
  }
}
