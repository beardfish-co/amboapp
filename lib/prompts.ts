// Reflection prompts for the Reflect view.
//
// Prompts are phenomenological — they ask the priest to notice, not to
// interpret. They never make theological claims. They are a resource, not
// a suggestion.
//
// Internally each prompt carries a `movement` tag corresponding to the
// classical lectio divina arc, in its priestly-ministerial form (per the
// Homiletic Directory and Manus's sharpening):
//
//   lectio        — what does this text actually say?
//   meditatio     — what is Christ saying to me, and to this parish?
//   oratio        — what must I say to the Lord in response?
//   contemplatio  — what conversion is being asked of me before I preach?
//   actio         — what one concrete movement should this assembly live?
//
// The Latin names NEVER appear in the UI. The selector returns prompts
// drawn across the movements, in arc order, so the priest senses the
// rhythm without being instructed in it.

export type ReadingSlot = "r1" | "ps" | "r2" | "gospel";
export type Season = "advent" | "christmas" | "lent" | "easter" | "ordinary";
export type Movement =
  | "lectio"
  | "meditatio"
  | "oratio"
  | "contemplatio"
  | "actio";

interface Prompt {
  text: string;
  movement: Movement;
  slots?: ReadingSlot[];          // if omitted: any slot
  seasons?: Season[];             // if omitted: any season
  source?: "francis";             // optional sub-set marker (see FRANCIS below)
}

// ────────────────────────────────────────────────────────────────────────
// LECTIO — close attention to what the text itself says
// ────────────────────────────────────────────────────────────────────────
const LECTIO: Prompt[] = [
  { text: "What's the smallest detail you almost skipped over?", movement: "lectio" },
  { text: "What would be lost if this reading ended one line earlier?", movement: "lectio" },
  { text: "What did you expect to find that isn't here?", movement: "lectio" },
  { text: "Read it once more — what shifts?", movement: "lectio" },

  { text: "What's being promised, and what's still unfinished?", movement: "lectio", slots: ["r1"] },
  { text: "Whose voice is this? Who are they speaking to?", movement: "lectio", slots: ["r1"] },
  { text: "What does this reading remember?", movement: "lectio", slots: ["r1"] },

  { text: "What mood does this psalm actually sit in?", movement: "lectio", slots: ["ps"] },
  { text: "What does this psalm ask God for?", movement: "lectio", slots: ["ps"] },

  { text: "Who is being written to, and what's their trouble?", movement: "lectio", slots: ["r2"] },
  { text: "Which sentence would you underline?", movement: "lectio", slots: ["r2"] },

  { text: "What does Jesus do here that you can't quite picture?", movement: "lectio", slots: ["gospel"] },
  { text: "Where is the silence?", movement: "lectio", slots: ["gospel"] },
];

// ────────────────────────────────────────────────────────────────────────
// MEDITATIO — what is the Word saying to me, and to this parish?
// (the dual ear: to me as a disciple, to this people I'm preaching to)
// ────────────────────────────────────────────────────────────────────────
const MEDITATIO: Prompt[] = [
  { text: "What surprised you here?", movement: "meditatio" },
  { text: "Which word do you keep returning to?", movement: "meditatio" },
  { text: "What sits uncomfortably?", movement: "meditatio" },
  { text: "Whose face came to mind as you read?", movement: "meditatio" },
  { text: "Where does this reading meet someone in your parish this week?", movement: "meditatio" },
  { text: "What in your parish is this passage already speaking to?", movement: "meditatio" },
  { text: "What concrete behaviour is this passage asking of someone?", movement: "meditatio", slots: ["r2"] },
  { text: "Which line would you want to be praying this week?", movement: "meditatio", slots: ["ps"] },
  { text: "Who in this scene are you?", movement: "meditatio", slots: ["gospel"] },
  { text: "Who do you find yourself judging here, and what does that tell you?", movement: "meditatio", slots: ["gospel"] },
];

// ────────────────────────────────────────────────────────────────────────
// ORATIO — what must I say to the Lord in response, before I preach?
// (repentance, praise, intercession, thanksgiving, petition)
// ────────────────────────────────────────────────────────────────────────
const ORATIO: Prompt[] = [
  { text: "What in this passage do you want to say back to God?", movement: "oratio" },
  { text: "What thanksgiving does this draw out of you?", movement: "oratio" },
  { text: "What do you need to ask the Lord for, before you preach this?", movement: "oratio" },
  { text: "What honest complaint can you bring to God here?", movement: "oratio" },
  { text: "Whose name do you want to lift to the Lord with this reading?", movement: "oratio" },
];

// ────────────────────────────────────────────────────────────────────────
// CONTEMPLATIO — what conversion is the Lord asking of me, the preacher,
// before I speak publicly?
// ────────────────────────────────────────────────────────────────────────
const CONTEMPLATIO: Prompt[] = [
  { text: "Where is this reading converting you before it converts anyone else?", movement: "contemplatio" },
  { text: "What in your priestly style does this passage quietly challenge?", movement: "contemplatio" },
  { text: "What would your people hear in you if you preached this honestly?", movement: "contemplatio" },
  { text: "What would you have to let go of to preach this freely?", movement: "contemplatio" },
  { text: "Where might you be tempted to soften this — and why?", movement: "contemplatio" },
];

// ────────────────────────────────────────────────────────────────────────
// ACTIO — one concrete evangelical movement for this assembly this week
// ────────────────────────────────────────────────────────────────────────
const ACTIO: Prompt[] = [
  { text: "What's the one line you'd want people to remember?", movement: "actio" },
  { text: "What single act of faith, hope, or charity could follow from this?", movement: "actio" },
  { text: "If your people lived only this passage this week, what would it look like?", movement: "actio" },
  { text: "What's the one thing you don't want to leave unsaid?", movement: "actio" },
  { text: "How does this prepare them to receive the Eucharist today?", movement: "actio" },
];

// ────────────────────────────────────────────────────────────────────────
// Season-coloured prompts (overlay) — tagged by movement too
// ────────────────────────────────────────────────────────────────────────
const BY_SEASON: Prompt[] = [
  { text: "What's being announced? What's still hidden?", movement: "lectio", seasons: ["advent"] },
  { text: "Whose waiting do you recognise?", movement: "meditatio", seasons: ["advent"] },

  { text: "Where does this reading cross with the manger?", movement: "meditatio", seasons: ["christmas"] },
  { text: "What does 'the Word made flesh' look like here?", movement: "contemplatio", seasons: ["christmas"] },

  { text: "What's being taken away here?", movement: "lectio", seasons: ["lent"] },
  { text: "Where is the wilderness?", movement: "meditatio", seasons: ["lent"] },
  { text: "What would repentance look like for you this week?", movement: "contemplatio", seasons: ["lent"] },
  { text: "What sacrifice could your parish make together?", movement: "actio", seasons: ["lent"] },

  { text: "What changes after the Resurrection that hasn't changed yet in this passage?", movement: "lectio", seasons: ["easter"] },
  { text: "What does 'he is risen' mean for the person in your pew who is exhausted?", movement: "meditatio", seasons: ["easter"] },
  { text: "Where is joy doing its quiet work?", movement: "contemplatio", seasons: ["easter"] },
];

// ────────────────────────────────────────────────────────────────────────
// FRANCIS — Pope Francis's lectio questions (Evangelii gaudium 153),
// kept as a named alternative set. Currently not surfaced by the default
// selector; can be exposed later as a softer, more intimate alternative.
// ────────────────────────────────────────────────────────────────────────
const FRANCIS: Prompt[] = [
  { text: "Lord, what does this text say to me?", movement: "meditatio", source: "francis" },
  { text: "What is it about my life that you want me to change by this text?", movement: "contemplatio", source: "francis" },
  { text: "What troubles me about this text?", movement: "meditatio", source: "francis" },
  { text: "What do I find pleasant in this text?", movement: "meditatio", source: "francis" },
  { text: "What is it about this word that moves me?", movement: "meditatio", source: "francis" },
  { text: "What attracts me here? Why does it attract me?", movement: "meditatio", source: "francis" },
];

function defaultPool(): Prompt[] {
  return [
    ...LECTIO,
    ...MEDITATIO,
    ...ORATIO,
    ...CONTEMPLATIO,
    ...ACTIO,
    ...BY_SEASON,
  ];
}

// Detect liturgical season from the Universalis day name string.
// Best-effort; falls back to "ordinary".
export function detectSeason(dayName: string | null | undefined): Season {
  const s = (dayName ?? "").toLowerCase();
  if (/advent/.test(s)) return "advent";
  if (/christmas|epiphany|nativity|holy family|baptism of the lord/.test(s)) return "christmas";
  if (/lent|ash wednesday|palm sunday|holy week|triduum|maundy|good friday|holy saturday/.test(s)) return "lent";
  if (/easter|pentecost|ascension|divine mercy/.test(s)) return "easter";
  return "ordinary";
}

// Deterministic pick: same day + same slot → same prompts, so the priest
// sees a stable set across refreshes in a single session.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The arc — prompts are returned in this order so the priest reading
// down the list moves naturally from listening through prayer to mission.
const MOVEMENT_ORDER: Movement[] = [
  "lectio",
  "meditatio",
  "oratio",
  "contemplatio",
  "actio",
];

// Select up to `count` prompts for a given reading slot + season.
// Strategy: pick at most one prompt per movement, walking the lectio arc
// from listening (lectio) to mission (actio). Slot- and season-specific
// prompts are preferred where they exist; falls back to universal.
export function selectPrompts(
  slot: ReadingSlot,
  season: Season,
  seedKey: string,
  count = 3,
): string[] {
  const pool = defaultPool().filter((p) => {
    if (p.slots && !p.slots.includes(slot)) return false;
    if (p.seasons && !p.seasons.includes(season)) return false;
    return true;
  });

  const seed = hashString(`${seedKey}|${slot}`);
  const picked: string[] = [];

  // Walk the arc. For each movement, try slot/season-specific first, then
  // universal. Skip movements gracefully if empty so we still hit `count`.
  for (const movement of MOVEMENT_ORDER) {
    if (picked.length >= count) break;
    const here = pool.filter((p) => p.movement === movement);
    if (here.length === 0) continue;

    // Prefer prompts that match the slot or the season (they're sharper).
    const sharp = here.filter((p) => p.slots?.includes(slot) || p.seasons?.includes(season));
    const broad = here.filter((p) => !p.slots && !p.seasons);
    const ordered = sharp.length > 0
      ? [...seededShuffle(sharp, seed + picked.length), ...seededShuffle(broad, seed + picked.length + 1)]
      : seededShuffle(broad, seed + picked.length);

    for (const p of ordered) {
      if (!picked.includes(p.text)) {
        picked.push(p.text);
        break;
      }
    }
  }

  // If we still don't have enough (rare — only when most movements are
  // empty for this slot/season combo), top up from any remaining.
  if (picked.length < count) {
    const rest = seededShuffle(pool, seed + 99);
    for (const p of rest) {
      if (picked.length >= count) break;
      if (!picked.includes(p.text)) picked.push(p.text);
    }
  }

  return picked.slice(0, count);
}

// Pope Francis's questions — surfaced separately when a softer, more
// intimate set is wanted. Same selector signature; ignores slot since
// these are personal-devotional questions, not text-shaped ones.
export function selectFrancisPrompts(seedKey: string, count = 3): string[] {
  const seed = hashString(`francis|${seedKey}`);
  return seededShuffle(FRANCIS.map((p) => p.text), seed).slice(0, count);
}
