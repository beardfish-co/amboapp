import { NextRequest, NextResponse } from "next/server";

// Strip HTML tags and decode common entities
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x2010;/g, "–")
    .replace(/&#x2018;/g, "\u2018")
    .replace(/&#x2019;/g, "\u2019")
    .replace(/&#x201c;/g, "\u201c")
    .replace(/&#x201d;/g, "\u201d")
    .replace(/&#xa0;/g, " ")
    .replace(/&#xa;/g, "\n")
    .replace(/&#x2013;/g, "–")
    .replace(/&#x2014;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
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
      return NextResponse.json({ error: "Unexpected Universalis format" }, { status: 502 });
    }

    const raw = JSON.parse(jsonMatch[1]);

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
      dayName: parseDayName(raw.day || ""),
      readings,
    });
  } catch (err) {
    console.error("Readings API error:", err);
    return NextResponse.json({ error: "Failed to fetch readings" }, { status: 500 });
  }
}
