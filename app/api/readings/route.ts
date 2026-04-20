import { NextRequest, NextResponse } from "next/server";

// Decode HTML entities — generic numeric (decimal + hex) plus common named ones.
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
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Strip HTML tags, preserving paragraph structure via blank lines.
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

// Extract plain text from the liturgical day name HTML
function parseDayName(html: string): string {
  return stripHtml(html).trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{8}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date. Use YYYYMMDD format." }, { status: 400 });
  }

  try {
    const url = `https://universalis.com/${date}/jsonpmass.js`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Ambo/1.0 (homily writing app; contact: jonathan@beardfish.co)" },
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Universalis fetch failed" }, { status: 502 });
    }

    const text = await res.text();

    // Strip JSONP wrapper: universalisCallback({...});
    const jsonMatch = text.match(/^universalisCallback\(([\s\S]*)\);?\s*$/);
    if (!jsonMatch) {
      // Universalis returns HTML (not JSONP) for dates beyond its future window
      // — treat these as "not yet published" so the UI can give a calm explanation
      // rather than an infrastructure-flavoured error.
      return NextResponse.json(
        { error: "Readings not published for this date", code: "not_published" },
        { status: 404 },
      );
    }

    const raw = JSON.parse(jsonMatch[1]);

    // Guard against Universalis' silent-redirect behaviour.
    // Their free JSONP endpoint quietly serves today's readings for any
    // date outside a ~3-day-past / ~9-day-future window around today.
    // The payload shape is unchanged but `raw.number` reflects the date
    // Universalis actually served, not the one we asked for. If they
    // mismatch, we must refuse to return the wrong readings.
    const requestedNum = Number(date);
    if (typeof raw.number === "number" && raw.number !== requestedNum) {
      return NextResponse.json(
        { error: "Readings not published for this date", code: "not_published" },
        { status: 404 },
      );
    }

    // Build clean reading objects
    const readings = [];

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

    return NextResponse.json({
      date: raw.date || date,
      number: typeof raw.number === "number" ? raw.number : requestedNum,
      dayName: parseDayName(raw.day || ""),
      readings,
    });
  } catch (err) {
    console.error("Readings API error:", err);
    return NextResponse.json({ error: "Failed to fetch readings" }, { status: 500 });
  }
}
