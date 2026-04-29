// POST /api/echo/generate
//
// Streams an AI-generated Echo output for the given homily text and output
// type. The response is a plain-text stream — the client reads chunks and
// appends them to the output area as tokens arrive.
//
// Request body:
//   { homilyText: string, outputType: string, variant?: string }
//
// outputType must be one of:
//   take-into-the-week | parish-reflection | social-post |
//   small-group-questions | prayer-prompt
//
// variant is used by parish-reflection (short | standard | longer) and
// social-post (before-sunday | after-sunday). Defaults to standard/before-sunday.
//
// Response:
//   Content-Type: text/plain; charset=utf-8
//   Transfer-Encoding: chunked
//   (streaming text tokens)
//
// Errors:
//   400 — missing or invalid fields
//   500 — Anthropic API or configuration error

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// ── Valid output types ─────────────────────────────────────────────────────

const VALID_OUTPUT_TYPES = [
  "take-into-the-week",
  "parish-reflection",
  "social-post",
  "small-group-questions",
  "prayer-prompt",
] as const;

type OutputType = (typeof VALID_OUTPUT_TYPES)[number];

function isValidOutputType(s: string): s is OutputType {
  return (VALID_OUTPUT_TYPES as readonly string[]).includes(s);
}

// ── System prompts ─────────────────────────────────────────────────────────

function getSystemPrompt(outputType: OutputType, variant?: string): string {
  switch (outputType) {
    case "parish-reflection":
      return getParishReflectionPrompt(variant);
    case "take-into-the-week":
      return getTakeIntoTheWeekPrompt();
    case "social-post":
      return getSocialPostPrompt(variant);
    case "small-group-questions":
      return getSmallGroupQuestionsPrompt();
    case "prayer-prompt":
      return getPrayerPromptPrompt();
  }
}

function getParishReflectionPrompt(variant?: string): string {
  const lengthSpec =
    variant === "short"
      ? "Target length: approximately 80 words. Do not exceed 100 words. This is for bulletins and brief inserts — brevity is the point."
      : variant === "longer"
      ? "Target length: approximately 350 words. Do not exceed 420 words. This is for monthly newsletters or retreat materials where a fuller reflection is appropriate."
      : "Target length: approximately 175 words. Do not exceed 220 words. This is for newsletter reflections, weekly emails, and website posts.";

  return `You are helping a Catholic priest carry his preached homily into parish life. Generate a Parish Reflection — a standalone written reflection for a parish newsletter, bulletin, weekly email, or parish website. ${lengthSpec}

Voice: The priest's voice carried into print. Reflective, accessible, true to the homily's tone. Not preachy, not a lecture. The reflection should read as something the priest himself might have written in a quiet moment after Mass — not a formal document, not a transcript.

Structure: A coherent reflection with a beginning, development, and closing thought. Not a summary of the homily — a reflection drawn from it. Let it breathe. It should feel complete in itself, not like an excerpt.

Universal constraints — all of the following apply without exception:

1. The priest's homily text is the only source of theological content. Do not introduce new ideas, new theological points, or new pastoral content not present in the homily.
2. Preserve the priest's voice — his vocabulary, rhythm, tone, and theological register. If he speaks simply, speak simply. If he draws on rich theological language, preserve that register.
3. Do not soften, sharpen, or alter the homily's emphasis. If he emphasizes mercy, the reflection emphasizes mercy. If he emphasizes sacrifice, the reflection emphasizes sacrifice.
4. Do not reproduce direct scripture quotations. Reference scripture by name and citation only, or paraphrase in the priest's own words. (Licensing constraint.)
5. Saints, Fathers, Catechism, magisterial documents, papal teaching — if the priest references these, preserve them freely.
6. Do not draw on any knowledge outside the provided homily. The reflection must be grounded entirely in what the priest said.
7. Output only the reflection text. No preamble, no explanation, no commentary. Just the output text.

Output only the Parish Reflection. Do not include any other text.`;
}

function getTakeIntoTheWeekPrompt(): string {
  return `You are helping a Catholic priest carry his preached homily into parish life. Generate a Take Into the Week — a short spoken reflection for the end of Mass, a single quiet note the congregation can carry home. Approximately 50–80 words.

Voice: Warm, personal, immediate. Spoken, not written. The priest addressing his people as they prepare to leave.

Structure: One thought. One image. One invitation. No lists, no sub-points — a single thread the hearer can hold.

Universal constraints — all of the following apply without exception:

1. The priest's homily text is the only source of theological content. Do not introduce new ideas not present in the homily.
2. Preserve the priest's voice — his vocabulary, rhythm, and tone.
3. Do not soften, sharpen, or alter the homily's emphasis.
4. Do not reproduce direct scripture quotations. Reference by name and citation, or paraphrase.
5. Saints, Fathers, Catechism, magisterial documents, papal teaching — preserve these freely.
6. Do not draw on any knowledge outside the provided homily.
7. Output only the reflection text. No preamble, no explanation, no commentary.

Output only the Take Into the Week text. Do not include any other text.`;
}

function getSocialPostPrompt(variant?: string): string {
  const timing =
    variant === "after-sunday"
      ? "This is an after-Sunday post — the Sunday has passed. The tone is grateful, reflective, looking back at what was received."
      : "This is a before-Sunday post — Sunday is coming. The tone is anticipatory, inviting, drawing people toward the Word they are about to hear.";

  return `You are helping a Catholic priest carry his preached homily into parish life. Generate a Social Post — a short, resonant note from the homily shaped for social sharing on Facebook, Instagram, or a parish website. Approximately 80–120 words including any hashtags.

${timing}

Voice: Warm and accessible. Inviting, not promotional. The priest speaking to his parish community online — the same voice, a shorter form.

Structure: One resonant image or idea. A brief development. An optional closing line or question. Optionally 2–3 hashtags at the end if natural.

Universal constraints — all of the following apply without exception:

1. The priest's homily text is the only source of theological content. Do not introduce new ideas not present in the homily.
2. Preserve the priest's voice and tone.
3. Do not soften, sharpen, or alter the homily's emphasis.
4. Do not reproduce direct scripture quotations. Reference by name and citation, or paraphrase.
5. Saints, Fathers, Catechism, magisterial documents, papal teaching — preserve these freely.
6. Do not draw on any knowledge outside the provided homily.
7. Output only the post text. No preamble, no explanation, no commentary.

Output only the Social Post. Do not include any other text.`;
}

function getSmallGroupQuestionsPrompt(): string {
  return `You are helping a Catholic priest carry his preached homily into parish life. Generate Small Group Questions — three to five discussion questions for faith-sharing groups, drawing the homily into lived conversation.

Voice: Contemplative and invitational. Questions that open space rather than test knowledge. Questions a group of ordinary faithful could sit with together.

Structure: 3–5 numbered questions. Each question stands on its own. Progress from personal encounter to communal reflection where natural.

Universal constraints — all of the following apply without exception:

1. The priest's homily text is the only source of theological content. Do not introduce new ideas not present in the homily.
2. Preserve the priest's theological register and emphasis.
3. Do not soften, sharpen, or alter the homily's emphasis.
4. Do not reproduce direct scripture quotations. Reference by name and citation, or paraphrase.
5. Saints, Fathers, Catechism, magisterial documents, papal teaching — preserve these freely.
6. Do not draw on any knowledge outside the provided homily.
7. Output only the questions. No preamble, no explanation, no commentary.

Output only the Small Group Questions. Do not include any other text.`;
}

function getPrayerPromptPrompt(): string {
  return `You are helping a Catholic priest carry his preached homily into parish life. Generate a Prayer Prompt — a short prayer drawn from the homily, 40–80 words, for personal or communal use through the week.

Voice: Devotional, reverent, prayerful. This must sound like a prayer, not a reflection about prayer and not instruction on how to pray. Address God directly — Father, Lord Jesus, or Holy Spirit — consistent with the homily's own theological emphasis. The words should feel natural on the lips of a parishioner in a quiet moment.

Structure: A single, complete prayer. One movement — not multiple parts or sections. No preamble, no pastoral instruction, no explanation of what to do. Simply pray.

Universal constraints — all of the following apply without exception:

1. The priest's homily text is the only source of theological content. Do not introduce new ideas not present in the homily.
2. Preserve the priest's theological register and emphasis.
3. Do not soften, sharpen, or alter the homily's emphasis.
4. Do not reproduce direct scripture quotations. Reference by name and citation, or paraphrase.
5. Saints, Fathers, Catechism, magisterial documents, papal teaching — preserve these freely.
6. Do not draw on any knowledge outside the provided homily.
7. Output only the prayer text. No preamble, no explanation, no commentary.

Output only the Prayer Prompt. Do not include any other text.`;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Parse body.
  let body: { homilyText?: string; outputType?: string; variant?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { homilyText, outputType, variant } = body;

  if (!homilyText || typeof homilyText !== "string" || homilyText.trim().length === 0) {
    return new Response(JSON.stringify({ error: "homilyText is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!outputType || !isValidOutputType(outputType)) {
    return new Response(
      JSON.stringify({
        error: `outputType must be one of: ${VALID_OUTPUT_TYPES.join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Anthropic API key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const systemPrompt = getSystemPrompt(outputType, variant);
  const client = new Anthropic({ apiKey });

  // Build a ReadableStream that pipes Anthropic streaming tokens to the client.
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Here is the homily text:\n\n${homilyText.trim()}`,
            },
          ],
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text));
          }
        }

        controller.close();
      } catch (err) {
        console.error("[echo/generate] Anthropic streaming error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
