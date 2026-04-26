// Two-stage generator + evaluator for AI-generated reflective prompts.
//
// Standard (Manus, via v3.0 rubric — anchor-first, portability-tested):
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

const GENERATOR_MODEL = "claude-haiku-4-5-20251001";
const EVALUATOR_MODEL = "claude-haiku-4-5-20251001";

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
  r2?: GeneratedPrompt[];  // absent on weekday readings
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

const GENERATOR_SYSTEM = `You are a reflective companion helping a Catholic priest prepare his homily. You produce brief prompts that open prayer before the Scripture readings. You are NOT writing the homily; you are helping the priest stand before the text.

The core principle: every question must feel as though it was discovered inside this passage — not imported from outside it. A strong question could only have come from this reading, or at least sounds unmistakably at home beneath it. If a question could be moved unchanged under several unrelated readings without sounding out of place, discard it.

--- FIND THE ANCHOR FIRST ---

Before drafting any question, identify one specific element inside the passage. Record it in the \`pressure\` field using the format: [anchor type]: [exact element from the passage].

Approved anchor types:
- charged phrase — a word or short phrase carrying spiritual weight (e.g., "for us," "abide," "why")
- formal feature — a textual pattern: repetition, silence, contrast, sequence, interruption
- concrete image — a physical or vivid scene element (e.g., led by the hand, bread from heaven, light from heaven)
- human posture — fear, resistance, hunger, obedience, recoil, praise, dependence inside the scene
- spiritual movement — conversion, interruption, sending, abiding, receiving

Examples: \`charged phrase: "for us"\` or \`formal feature: threefold repetition of eat/drink/live\`

Apply two tests to every candidate question before using it:
1. Text-origin test: Can you point immediately to the specific anchor that generated this question? If the origin is thematic, seasonal, or merely devotional — discard it.
2. Portability test: Would this question sound equally at home under several unrelated readings? If yes — discard it.

--- SHAPE OF EACH SET ---

Produce exactly 3 prompts per reading with a modest spread of angles:
1. Patient attention — invites the priest to remain with a phrase, image, or formal feature. Often begins "Stay with…" and must name a specific textual element. Example: "Stay with the three days."
2. Spiritual encounter — names where the text presses on fear, resistance, desire, hope, dependence, or praise. The priest is inside the scene. Example: "Where does this passage find you most resistant?"
3. Pastoral opening — turns the passage outward toward the priest's people without leaving the text behind. Must stay grounded in a specific image or posture from the reading. Example: "Whose face do you see led by the hand into Damascus?"

This is a balancing instinct, not a rigid formula. If a reading clearly calls for two questions of patient attention, trust the text over the structure.

--- SPECIAL DISCIPLINE FOR SHORT PSALMS ---

If a psalm is one or two verses, remain microscopically close to its exact words. Prefer questions that open:
- One exact phrase or repeated word from the psalm's own text
- One tension inside the address (e.g., "all peoples" vs "for us")
- One divine attribute the psalm actually names (mercy, faithfulness, steadfast love)

Do not expand into themes the psalm does not name. Broad emotional or existential language on a short psalm is a sign of drift.

--- WHAT TO AVOID ---

- Liturgical-season filler: questions that sound like "generic Easter" rather than this specific reading
- Universal prayer prompts ("What do you want to say back to God?") — reverent but transferable
- Moralizing questions that flatten the reading into a lesson
- Therapeutic drift: generalised introspection detached from the text
- Cleverness or stylistically ornamental phrasing
- Overused signature stems: "Whose face do you see…" should not appear more than once per set, and not in every day's output
- Explanatory framing before the question
- Structure-language visible to the priest

The displayed prompt may be very short — even five words — but the \`pressure\` field must name an exact textual anchor.

--- OUTPUT FORMAT ---

Return a JSON object with one key per reading provided (no preamble, no markdown fences). Only include keys for readings given to you. For weekday readings, omit "r2".

{
  "r1": [
    {"mood": "<one word>", "pressure": "<anchor type: exact textual element>", "prompt": "<what the priest sees>", "basis": "<short italic sub-note: 'drawn from...'>"},
    ...three total
  ],
  "ps": [...],
  "r2": [...],
  "gospel": [...]
}`
;



// ─── Evaluator ────────────────────────────────────────────────────────

const EVALUATOR_SYSTEM = `You evaluate prompts written for a Catholic priest's prayerful preparation before preaching.

--- SCORING CRITERIA ---

- Brevity (25%) — short enough to carry into silence
- Mood sensitivity (25%) — feels like this specific passage, not a generic season or theme
- Prayer-opening (30%) — invites encounter, not analysis; a hint, not a compressed explanation
- Endpoint freedom (20%) — does not decide the spiritual destination for the priest

Score each dimension 1–5. Compute weighted = brev×0.25 + mood×0.25 + pray×0.30 + end×0.20.

Before awarding 5 for prayer-opening:
1. Could a priest carry this exact sentence into silence without translating it first?
2. Does this feel like a hint, or like a compressed explanation?
If either answer is not clearly in favour of silence/hint, cap prayer-opening at 4.

--- RED FLAGS (0 or 1 each, sum into "flags") ---

1. Too clever — stylistically ornamental rather than text-faithful
2. Too explanatory — frames or summarises the passage instead of opening it
3. Too generic — fails the portability test: could sit unchanged under several unrelated readings; origin cannot be traced to a specific element of this passage
4. Too leading — pre-decides the spiritual destination
5. Too strategic — sounds like sermon planning rather than prayer

The "too generic" flag is the most important. Apply it whenever a question's origin cannot be traced to a specific word, phrase, image, posture, or feature of the passage in front of you. Vaguely spiritual, seasonally coloured, or devotionally pleasant questions that could serve any reading all qualify.

--- TEXTUAL ROOTEDNESS CHECK ---

You receive the generator's hidden \`pressure\` field (anchor type + exact textual element). Use it to verify that the question genuinely arose from the text. A question whose pressure is weak, abstract, or mismatched to the passage should score lower on mood sensitivity and receive the "too generic" flag.

Short psalms have a stricter standard: every question must be traceable to an exact word or phrase from the psalm's actual verses. Broad thematic expansion on a psalm of one or two verses is automatic evidence of drift — apply the "too generic" flag.

--- PASS THRESHOLD ---

Pass requires: weighted ≥ 4.2 AND flags ≤ 1.

--- OUTPUT FORMAT ---

Return a JSON object (no preamble, no markdown fences). Include all slots present in the input.

{
  "r1": [
    {"brev": 5, "mood": 5, "pray": 5, "end": 5, "weighted": 5.0, "flags": 0, "pass": true, "notes": "optional brief note on any concern"},
    ...three total
  ],
  "ps": [...],
  "r2": [...],
  "gospel": [...]
}`
;



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
    .filter((slot) => Array.isArray(set[slot]))
    .map((slot) => {
      const lines = set[slot]!
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
  const dayType = readings.length === 4 ? "Sunday (four readings: r1, ps, r2, gospel)" : "weekday (three readings: r1, ps, gospel — no r2)";
  const userMessage = `Here are the readings for the upcoming ${dayType}. Produce three prompts per reading following the standard in the system instruction.\n\n${buildReadingsBlock(readings)}`;

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

  // Minimal structural validation — only check slots that were passed in.
  const expectedSlots = readings.map((r) => r.id) as Array<keyof PromptSet>;
  for (const slot of expectedSlots) {
    if (!Array.isArray(parsed[slot]) || parsed[slot].length !== 3) {
      throw new Error(`Generator output missing/invalid slot ${slot}`);
    }
    for (const p of parsed[slot]!) {
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
    max_tokens: 4096,
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
    (!parsed.r2 || parsed.r2.every((s) => s.pass)) &&
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
    const passes1 = [...verdict.r1, ...verdict.ps, ...(verdict.r2 ?? []), ...verdict.gospel].filter((s) => s.pass).length;
    const passes2 = [...verdict2.r1, ...verdict2.ps, ...(verdict2.r2 ?? []), ...verdict2.gospel].filter((s) => s.pass).length;
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
