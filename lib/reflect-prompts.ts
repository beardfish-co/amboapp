// Two-stage generator + evaluator for AI-generated reflective prompts.
//
// Standard (Manus, via v2.1 rubric):
//   Brief · mood-faithful · prayer-opening · endpoint-free
//
// The displayed prompt may be very short, but the generator's reasoning
// must remain text-specific. We enforce this by asking the generator to
// return {mood, pressure, prompt, basis} per prompt — the evaluator reads
// all four and judges specificity of `pressure`, not eloquence of prose.
//
// Three shapes cover the stable ground (from the v2.1 batch analysis):
//   1. "Stay with [textual feature]."              — text-attentive
//   2. "Where does this passage find you?"         — phenomenological
//   3. "Whose face do you see in [image]?"         — priestly mediation
//
// One generator call produces 3 prompts across these shapes per reading,
// covering all four readings at once. One evaluator call grades the set.
// On any fail, regenerate once; on double-fail, fall back to a safe shape.

import Anthropic from "@anthropic-ai/sdk";

const GENERATOR_MODEL = "claude-sonnet-4-5-20250929";
const EVALUATOR_MODEL = "claude-sonnet-4-5-20250929";

export interface PromptReading {
  id: "r1" | "ps" | "r2" | "gospel";
  title: string;
  reference: string;
  heading: string;
  text: string;
}

export interface GeneratedPrompt {
  prompt: string;    // what the priest sees
  basis: string;     // italic sub-note below
  mood: string;      // hidden — one word
  pressure: string;  // hidden — one phrase naming the textual feature
}

export interface EvaluatorScore {
  brev: number;
  mood: number;
  pray: number;
  end: number;
  weighted: number;
  flags: number;
  pass: boolean;
  notes?: string;
}

export interface PromptSet {
  r1: GeneratedPrompt[];
  ps: GeneratedPrompt[];
  r2: GeneratedPrompt[];
  gospel: GeneratedPrompt[];
}

export interface EvaluatorVerdict {
  r1: EvaluatorScore[];
  ps: EvaluatorScore[];
  r2: EvaluatorScore[];
  gospel: EvaluatorScore[];
  allPass: boolean;
}

// ─── Generator ────────────────────────────────────────────────────────

const GENERATOR_SYSTEM = `You are a reflective companion helping a Catholic priest prepare his Sunday homily. You produce brief prompts that open prayer before the Scripture readings. You are NOT writing the homily; you are helping the priest stand before the text.

The standard (hold it strictly):

Read each passage prayerfully. Notice its mood and one point of pressure. Write a brief prompt that opens deeper engagement in prayer without deciding the endpoint. Do not explain the insight. Do not sound clever. Stop early.

The displayed prompt may be very short — even five words — but your hidden reasoning must remain text-specific. Every prompt must arise from a real textual feature in the passage in front of you.

For each of the four readings (r1, ps, r2, gospel), produce exactly 3 prompts that together cover these three shapes:

1. **Text-attentive** — typically begins "Stay with…" and names one specific feature in the text (an image, a word, a silence, an interval, a repetition, a turn). Example: "Stay with the interval."
2. **Phenomenological** — where the passage finds the priest himself. Usually a form of "Where does this passage find you?" or "Where in this passage are you most uneasy?" Kept bare; no triadic options.
3. **Priestly mediation** — the priest lifting the passage toward his people, always image-grounded. Usually "Whose face do you see in…?" Never sermon strategy.

Avoid at all costs:
- Cleverness, polish, quotable phrasing
- Explanatory framing before the question ("The prophet does not say X, he says Y, then names Z — stay with the reversal" is too much; "Stay with the prophet's reversal" is right)
- Structure-language visible to the priest ("two passives", "triadic pairing", "indicative voice")
- Compressed theology presented as a question
- Sermon strategy ("What do your people need this Sunday?")
- Generic spiritual language that could fit any passage

Return a JSON object exactly matching this shape (no preamble, no markdown fences):

{
  "r1": [
    {"mood": "<one word>", "pressure": "<specific textual feature>", "prompt": "<what the priest sees>", "basis": "<short italic sub-note: 'drawn from...'>"},
    ...three total
  ],
  "ps": [...],
  "r2": [...],
  "gospel": [...]
}`;

// ─── Evaluator ────────────────────────────────────────────────────────

const EVALUATOR_SYSTEM = `You evaluate prompts written for a Catholic priest's prayerful preparation before preaching. The standard:

- **Brevity (25%)** — short enough to carry into silence
- **Mood sensitivity (25%)** — feels like the passage it came from
- **Prayer-opening (30%)** — invites encounter, not analysis
- **Endpoint freedom (20%)** — does not decide the destination

Score each 1–5. Compute weighted = brev*0.25 + mood*0.25 + pray*0.30 + end*0.20.

Before awarding 5 for prayer-opening, apply both tests:
1. Could a priest carry this exact sentence into silence without needing to translate it first?
2. Does this feel like a hint, or like a compressed explanation?
If either answer is not clearly in favour of silence/hint, cap prayer-opening at 4.

Count red flags (0 or 1 each): too clever, too explanatory, too generic, too leading, too strategic. Sum into a single "flags" integer 0–5.

Pass requires: weighted ≥ 4.2 AND flags ≤ 1.

You'll receive the passages and the generated prompts (with the generator's hidden reasoning: mood, pressure). Use the hidden reasoning to verify textual rootedness — but do NOT reward brilliance of the hidden reasoning. The verdict is about the prompt shown to the priest.

Return a JSON object (no preamble, no markdown fences):

{
  "r1": [
    {"brev": 5, "mood": 5, "pray": 5, "end": 5, "weighted": 5.0, "flags": 0, "pass": true, "notes": "optional brief note on any concern"},
    ...three total
  ],
  "ps": [...],
  "r2": [...],
  "gospel": [...]
}`;

// ─── Fallback shape library ───────────────────────────────────────────

const FALLBACK: PromptSet = {
  r1: [
    { prompt: "Where does this passage find you?", basis: "open invitation", mood: "quiet", pressure: "fallback: bare phenomenological" },
    { prompt: "Stay with the word that catches you.", basis: "the priest's own noticing", mood: "attentive", pressure: "fallback: bare text-attentive" },
    { prompt: "Whose face comes to mind as you read?", basis: "priestly mediation", mood: "pastoral", pressure: "fallback: bare mediation" },
  ],
  ps: [
    { prompt: "Which line would you pray this week?", basis: "the psalm's own voice", mood: "quiet", pressure: "fallback: psalm-specific" },
    { prompt: "What mood does this psalm sit in?", basis: "the psalm's atmosphere", mood: "attentive", pressure: "fallback: psalm-specific" },
    { prompt: "Where does this passage find you?", basis: "open invitation", mood: "quiet", pressure: "fallback: bare phenomenological" },
  ],
  r2: [
    { prompt: "Which sentence would you underline?", basis: "the text's own force", mood: "attentive", pressure: "fallback: bare text-attentive" },
    { prompt: "Where does this passage find you?", basis: "open invitation", mood: "quiet", pressure: "fallback: bare phenomenological" },
    { prompt: "Who in your people does this passage address?", basis: "priestly mediation", mood: "pastoral", pressure: "fallback: bare mediation" },
  ],
  gospel: [
    { prompt: "Where is the silence?", basis: "the text's own pacing", mood: "attentive", pressure: "fallback: bare text-attentive" },
    { prompt: "Where does this passage find you?", basis: "open invitation", mood: "quiet", pressure: "fallback: bare phenomenological" },
    { prompt: "Whose face do you see here?", basis: "priestly mediation", mood: "pastoral", pressure: "fallback: bare mediation" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────

function stripJsonFences(s: string): string {
  let t = s.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return t.trim();
}

function buildReadingsBlock(readings: PromptReading[]): string {
  return readings
    .map((r) => `### ${r.id.toUpperCase()} — ${r.title}\n**${r.reference}**\n${r.heading ? r.heading + "\n" : ""}\n${r.text}`)
    .join("\n\n---\n\n");
}

function buildPromptsBlock(set: PromptSet): string {
  const slots: Array<keyof PromptSet> = ["r1", "ps", "r2", "gospel"];
  return slots
    .map((slot) => {
      const lines = set[slot]
        .map((p, i) => `  [${i + 1}] prompt: ${p.prompt}\n      pressure: ${p.pressure}\n      mood: ${p.mood}`)
        .join("\n");
      return `${slot.toUpperCase()}:\n${lines}`;
    })
    .join("\n\n");
}

// ─── Generator call ───────────────────────────────────────────────────

async function callGenerator(
  client: Anthropic,
  readings: PromptReading[],
): Promise<PromptSet> {
  const userMessage = `Here are the four readings for the upcoming Sunday. Produce three prompts per reading following the standard in the system instruction.\n\n${buildReadingsBlock(readings)}`;

  const resp = await client.messages.create({
    model: GENERATOR_MODEL,
    max_tokens: 2048,
    system: GENERATOR_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = resp.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Generator returned no text content");
  }

  const raw = stripJsonFences(textBlock.text);
  let parsed: PromptSet;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Generator returned invalid JSON: ${(err as Error).message}`);
  }

  // Minimal structural validation.
  for (const slot of ["r1", "ps", "r2", "gospel"] as const) {
    if (!Array.isArray(parsed[slot]) || parsed[slot].length !== 3) {
      throw new Error(`Generator output missing/invalid slot ${slot}`);
    }
    for (const p of parsed[slot]) {
      if (!p.prompt || !p.basis || !p.pressure || !p.mood) {
        throw new Error(`Generator output ${slot} prompt missing required fields`);
      }
    }
  }

  return parsed;
}

// ─── Evaluator call ───────────────────────────────────────────────────

async function callEvaluator(
  client: Anthropic,
  readings: PromptReading[],
  set: PromptSet,
): Promise<EvaluatorVerdict> {
  const userMessage = `READINGS:\n\n${buildReadingsBlock(readings)}\n\n---\n\nPROMPTS TO EVALUATE:\n\n${buildPromptsBlock(set)}`;

  const resp = await client.messages.create({
    model: EVALUATOR_MODEL,
    max_tokens: 1536,
    system: EVALUATOR_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = resp.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Evaluator returned no text content");
  }

  const raw = stripJsonFences(textBlock.text);
  let parsed: Omit<EvaluatorVerdict, "allPass">;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Evaluator returned invalid JSON: ${(err as Error).message}`);
  }

  const allPass =
    parsed.r1.every((s) => s.pass) &&
    parsed.ps.every((s) => s.pass) &&
    parsed.r2.every((s) => s.pass) &&
    parsed.gospel.every((s) => s.pass);

  return { ...parsed, allPass };
}

// ─── Orchestrator ─────────────────────────────────────────────────────

export interface GenerationResult {
  prompts: PromptSet;
  verdict: EvaluatorVerdict | null; // null if fallback was used
  generatorModel: string;
  usedFallback: boolean;
}

export async function generateDayPrompts(
  readings: PromptReading[],
): Promise<GenerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key configured — fall back silently. This keeps the Reflect page
    // functional in local dev before the key is provisioned.
    return {
      prompts: FALLBACK,
      verdict: null,
      generatorModel: "fallback",
      usedFallback: true,
    };
  }

  const client = new Anthropic({ apiKey });

  // Attempt 1.
  try {
    const set = await callGenerator(client, readings);
    const verdict = await callEvaluator(client, readings, set);
    if (verdict.allPass) {
      return { prompts: set, verdict, generatorModel: GENERATOR_MODEL, usedFallback: false };
    }

    // Attempt 2 — one regeneration, then accept or fallback.
    const set2 = await callGenerator(client, readings);
    const verdict2 = await callEvaluator(client, readings, set2);
    if (verdict2.allPass) {
      return { prompts: set2, verdict: verdict2, generatorModel: GENERATOR_MODEL, usedFallback: false };
    }

    // Both attempts had at least one fail. Use whichever had more passes;
    // on tie, keep the second. The verdict is preserved so we can audit.
    const passes1 = [...verdict.r1, ...verdict.ps, ...verdict.r2, ...verdict.gospel].filter((s) => s.pass).length;
    const passes2 = [...verdict2.r1, ...verdict2.ps, ...verdict2.r2, ...verdict2.gospel].filter((s) => s.pass).length;
    if (passes1 > passes2) {
      return { prompts: set, verdict, generatorModel: GENERATOR_MODEL, usedFallback: false };
    }
    return { prompts: set2, verdict: verdict2, generatorModel: GENERATOR_MODEL, usedFallback: false };
  } catch (err) {
    console.error("[reflect-prompts] generator/evaluator failed, using fallback:", err);
    return {
      prompts: FALLBACK,
      verdict: null,
      generatorModel: "fallback",
      usedFallback: true,
    };
  }
}
