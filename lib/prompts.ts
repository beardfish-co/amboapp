// Reflection prompts for the Reflect view.
//
// Prompts are phenomenological — they ask the priest to notice, not to
// interpret. They never make theological claims. They are a resource, not
// a suggestion. Selector returns up to 3 prompts per reading slot, with a
// season overlay on top of the universal set.
//
// Universalis gives us a dayName (e.g. "3rd Sunday of Easter"). We derive
// season from that. Reading slots come from the reading id (r1, ps, r2,
// gospel).

export type ReadingSlot = "r1" | "ps" | "r2" | "gospel";
export type Season = "advent" | "christmas" | "lent" | "easter" | "ordinary";

interface Prompt {
  text: string;
  slots?: ReadingSlot[]; // if omitted: any slot
  seasons?: Season[];    // if omitted: any season
}

// Universal prompts — fit any reading, any season.
const UNIVERSAL: Prompt[] = [
  { text: "What surprised you here?" },
  { text: "Which word do you keep returning to?" },
  { text: "What sits uncomfortably?" },
  { text: "What's the smallest detail you almost skipped over?" },
  { text: "What did you expect to find that isn't here?" },
  { text: "What's the one line you'd want people to remember?" },
  { text: "Where does this reading meet someone in your parish?" },
  { text: "What would be lost if this reading ended one line earlier?" },
];

// Slot-specific prompts — tuned to the literary shape of the reading.
const BY_SLOT: Prompt[] = [
  // First Reading — usually Old Testament narrative, prophecy, or wisdom.
  { text: "What's being promised, and what's still unfinished?", slots: ["r1"] },
  { text: "Whose voice is this? Who are they speaking to?", slots: ["r1"] },
  { text: "What does this reading remember?", slots: ["r1"] },

  // Psalm — prayer, response, lament, praise.
  { text: "Which line would you want to be praying this week?", slots: ["ps"] },
  { text: "What mood does this psalm actually sit in?", slots: ["ps"] },
  { text: "What does this psalm ask God for?", slots: ["ps"] },

  // Second Reading — usually epistle, sometimes Acts or Revelation.
  { text: "What concrete behaviour is being asked?", slots: ["r2"] },
  { text: "Which sentence would you underline?", slots: ["r2"] },
  { text: "Who is being written to, and what's their trouble?", slots: ["r2"] },

  // Gospel — narrative, parable, discourse, miracle, passion, appearance.
  { text: "Who in this scene are you?", slots: ["gospel"] },
  { text: "Who do you find yourself judging, and what does that tell you?", slots: ["gospel"] },
  { text: "What does Jesus do here that you can't quite picture?", slots: ["gospel"] },
  { text: "Where is the silence?", slots: ["gospel"] },
];

// Season-specific prompts — any slot, but coloured by the liturgical season.
const BY_SEASON: Prompt[] = [
  { text: "What's being announced? What's still hidden?", seasons: ["advent"] },
  { text: "Whose waiting do you recognise?", seasons: ["advent"] },

  { text: "Where does this reading cross with the manger?", seasons: ["christmas"] },
  { text: "What does 'the Word made flesh' look like here?", seasons: ["christmas"] },

  { text: "What's being taken away here?", seasons: ["lent"] },
  { text: "Where is the wilderness?", seasons: ["lent"] },
  { text: "What would repentance look like for you this week?", seasons: ["lent"] },

  { text: "What changes after the Resurrection that hasn't changed yet in this passage?", seasons: ["easter"] },
  { text: "What does 'he is risen' mean for the person in your pew who is exhausted?", seasons: ["easter"] },
  { text: "Where is joy doing its quiet work?", seasons: ["easter"] },
];

function allPrompts(): Prompt[] {
  return [...UNIVERSAL, ...BY_SLOT, ...BY_SEASON];
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

// Select up to `count` prompts for a given reading slot + season.
// Mixes one slot-specific, one season-specific (if available), rest universal.
export function selectPrompts(
  slot: ReadingSlot,
  season: Season,
  seedKey: string,
  count = 3,
): string[] {
  const pool = allPrompts().filter((p) => {
    if (p.slots && !p.slots.includes(slot)) return false;
    if (p.seasons && !p.seasons.includes(season)) return false;
    return true;
  });

  const slotPrompts = pool.filter((p) => p.slots?.includes(slot));
  const seasonPrompts = pool.filter((p) => p.seasons?.includes(season));
  const universalPrompts = pool.filter((p) => !p.slots && !p.seasons);

  const seed = hashString(`${seedKey}|${slot}`);
  const picked: string[] = [];

  const pickOne = (from: Prompt[]) => {
    if (from.length === 0) return;
    const shuffled = seededShuffle(from, seed + picked.length);
    for (const p of shuffled) {
      if (!picked.includes(p.text)) {
        picked.push(p.text);
        return;
      }
    }
  };

  pickOne(slotPrompts);
  pickOne(seasonPrompts);
  while (picked.length < count) {
    const before = picked.length;
    pickOne(universalPrompts);
    if (picked.length === before) break;
  }

  return picked.slice(0, count);
}
