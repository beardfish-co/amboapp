// GET /api/magisterium/prefetch
//
// Called by Vercel cron every Monday at 06:00 UTC to pre-warm the
// magisterium_cache for the coming Sunday. This means the first priest
// who opens the Gospel on Sunday gets the cached response instantly,
// rather than waiting ~10s for the Magisterium API.
//
// Auth: protected by CRON_SECRET env var. Vercel cron sends:
//   Authorization: Bearer {CRON_SECRET}
//
// Requires: CRON_SECRET, MAGISTERIUM_API_KEY, SUPABASE_SERVICE_ROLE_KEY
// in Vercel environment variables.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAGISTERIUM_API_URL =
  "https://www.magisterium.com/api/v1/chat/completions";

const SYSTEM_PROMPT = `You are a theological reference assistant for Catholic priests preparing a homily.
Given a Gospel passage, provide 3 to 4 citations from official Church documents that illuminate the 
central themes of the passage for preaching.

Source priority — follow this order strictly:
1. Catechism of the Catholic Church (1992) — always try to include at least 2 CCC citations
2. Vatican II documents (1962–1965): Dei Verbum, Lumen Gentium, Gaudium et Spes, Sacrosanctum Concilium, etc.
3. Post-conciliar papal documents: encyclicals, apostolic exhortations (e.g. Evangelii Gaudium, Deus Caritas Est)
4. Earlier papal encyclicals only if directly relevant and no modern source covers the theme

Do not cite the Church Fathers, patristic commentary, or the Catena Aurea — those are covered separately.
Do not cite Scripture directly.

For each citation, include the source and paragraph number in parentheses after the quote:
(CCC §1234) or (Gaudium et Spes §22) or (Evangelii Gaudium §n).
Do not use footnote markers like [^1].

Write in clear prose. Use **bold** for document titles. Use > blockquote for direct quotations.
Do not end with questions, offers to assist further, or invitations to reply.`;

function cleanContent(raw: string): string {
  return raw
    .replace(/\[\^\w+\]/g, "")
    .replace(/^Below are[^\n]*\n+/i, "")
    .replace(/^Here are[^\n]*\n+/i, "")
    .replace(/\n*If you want[^]*$/i, "")
    .replace(/\n*Would you like[^]*$/i, "")
    .replace(/\n*Let me know[^]*$/i, "")
    .trim();
}

// Returns the coming Sunday's date as YYYYMMDD.
// When run on Monday, getUTCDay() === 1, so daysAhead = 6.
function nextSundayCompact(): string {
  const now = new Date();
  const daysAhead = ((7 - now.getUTCDay()) % 7) || 7;
  const sunday = new Date(now);
  sunday.setUTCDate(now.getUTCDate() + daysAhead);
  const y = sunday.getUTCFullYear();
  const m = String(sunday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sunday.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function GET(req: NextRequest) {
  // Validate cron secret
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = nextSundayCompact();
  const supabase = createAdminClient();

  // Check if already cached for this Sunday
  const { data: existing } = await supabase
    .from("magisterium_cache")
    .select("date")
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ status: "already_cached", date });
  }

  // Fetch Gospel reference from readings API
  const readingsUrl = new URL(`/api/readings?date=${date}`, req.url);
  const readingsRes = await fetch(readingsUrl.toString());

  if (!readingsRes.ok) {
    return NextResponse.json(
      { error: "Could not fetch readings", date },
      { status: 500 }
    );
  }

  interface ReadingsPayload {
    dayName: string;
    readings: Array<{ id: string; reference: string }>;
  }
  const readings: ReadingsPayload = await readingsRes.json();
  const gospel = readings.readings.find((r) => r.id === "gospel");

  if (!gospel?.reference) {
    return NextResponse.json(
      { error: "Gospel not found in readings", date },
      { status: 500 }
    );
  }

  // Query Magisterium AI
  const apiKey = process.env.MAGISTERIUM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "MAGISTERIUM_API_KEY not set" },
      { status: 500 }
    );
  }

  const magRes = await fetch(MAGISTERIUM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "magisterium-1",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `The Gospel reading is ${gospel.reference} (${readings.dayName}). Provide 3 to 4 magisterial citations for a priest preparing a homily on this passage.`,
        },
      ],
    }),
  });

  if (!magRes.ok) {
    return NextResponse.json(
      { error: "Magisterium API failed", status: magRes.status, date },
      { status: 500 }
    );
  }

  interface MagisteriumResponse {
    choices: Array<{ message: { content: string } }>;
  }
  const magData: MagisteriumResponse = await magRes.json();
  const raw = magData.choices?.[0]?.message?.content ?? "";

  if (!raw) {
    return NextResponse.json(
      { error: "Empty response from Magisterium AI", date },
      { status: 500 }
    );
  }

  const content = cleanContent(raw);

  // Store in cache (service role bypasses RLS)
  const { error: insertErr } = await supabase.from("magisterium_cache").insert({
    date,
    gospel_ref: gospel.reference,
    day_name: readings.dayName,
    content,
  });

  if (insertErr && insertErr.code !== "23505") {
    console.error("[magisterium/prefetch] insert error:", insertErr);
    return NextResponse.json(
      { error: "Cache insert failed", date },
      { status: 500 }
    );
  }

  console.log(`[magisterium/prefetch] Cached ${gospel.reference} for ${date}`);
  return NextResponse.json({
    status: "prefetched",
    date,
    gospel_ref: gospel.reference,
    day_name: readings.dayName,
  });
}
