/**
 * Catena Aurea scripture reference parser + lookup types.
 *
 * The data lives in /data/catena/{Matt,Mark,Luke,John}.json and is loaded
 * server-side by /app/api/catena/route.ts. This module holds only the parsing
 * utilities and the shared types so both the route and the client can use them.
 */

export type CatenaGospel = "Matt" | "Mark" | "Luke" | "John";

export type CatenaEntry = {
  /** Father's name — e.g. "Jerome", "Aug", "Pseudo-Chrys". May be null for orphan continuation paragraphs that we couldn't merge. */
  father: string | null;
  /** Optional citation following the name — e.g. "Hom. in Matt., Hom. ii" */
  citation?: string;
  /** The body of the patristic commentary. */
  text: string;
};

export type CatenaBlock = {
  chapter: number;
  verseStart: number;
  verseEnd: number;
  text: string;
  entries: CatenaEntry[];
};

export type ParsedRef = {
  gospel: CatenaGospel;
  chapter: number;
  verseStart: number;
  verseEnd: number;
};

// Order matters: longer names first so that "Matthew" wins over "Matt", etc.
const BOOK_ALIASES: Array<[RegExp, CatenaGospel]> = [
  [/^Matthew\b/i, "Matt"],
  [/^Matt\b/i, "Matt"],
  [/^Mt\b/i, "Matt"],
  [/^Mark\b/i, "Mark"],
  [/^Mk\b/i, "Mark"],
  [/^Luke\b/i, "Luke"],
  [/^Lk\b/i, "Luke"],
  [/^John\b/i, "John"],
  [/^Jn\b/i, "John"],
];

/**
 * Parse a scripture reference like "Matthew 28:16-20", "Luke 24:13-35", or
 * "John 3:16" into a structured object. Returns null for non-Gospel references
 * (e.g. psalms, epistles) or unparseable strings.
 *
 * Handles:
 *   - "Matthew 5:1-12"
 *   - "Mt 5:1-12"
 *   - "John 3:16"
 *   - "Matthew 5:1-12a"   (strips trailing letter)
 *   - "John 5:31-6:1"      (cross-chapter → caps at end-of-chapter)
 *
 * Only honours the first comma-separated segment (e.g. "Luke 1:1-4, 5-12" → 1-4).
 */
export function parseScriptureRef(ref: string): ParsedRef | null {
  if (!ref) return null;
  const trimmed = ref.replace(/^[\s"'\u00ab]+/, "").trim();

  let gospel: CatenaGospel | null = null;
  let rest = "";
  for (const [re, g] of BOOK_ALIASES) {
    const m = trimmed.match(re);
    if (m) {
      gospel = g;
      rest = trimmed.slice(m[0].length).trim();
      break;
    }
  }
  if (!gospel) return null;

  const firstSegment = rest.split(/\s*[,;]\s*/)[0];

  const m = firstSegment.match(
    /^(\d+)\s*:\s*(\d+)(?:\s*[-\u2013]\s*(?:(\d+)\s*:\s*)?(\d+))?/,
  );
  if (!m) return null;

  const chapter = parseInt(m[1], 10);
  const verseStart = parseInt(m[2], 10);
  let verseEnd = verseStart;
  if (m[4]) {
    if (m[3]) {
      const endChapter = parseInt(m[3], 10);
      if (endChapter !== chapter) {
        verseEnd = 9999;
      } else {
        verseEnd = parseInt(m[4], 10);
      }
    } else {
      verseEnd = parseInt(m[4], 10);
    }
  }

  return { gospel, chapter, verseStart, verseEnd };
}

/**
 * Given a parsed ref and a loaded list of Catena blocks for the relevant
 * gospel, return blocks whose verse range overlaps the ref's range.
 */
export function findMatchingBlocks(
  ref: ParsedRef,
  blocks: CatenaBlock[],
): CatenaBlock[] {
  return blocks.filter(
    (b) =>
      b.chapter === ref.chapter &&
      b.verseEnd >= ref.verseStart &&
      b.verseStart <= ref.verseEnd,
  );
}

// ─── Father name normalisation ────────────────────────────────────────────────
// The Catena Aurea source data uses a mix of full names, Latin abbreviations,
// and inconsistent casing inherited from the original Aquinas text.
// This map normalises every known variant to a clean display name.

const FATHER_NAME_MAP: Record<string, string> = {
  // Augustine
  "aug":              "Augustine",
  "Aug":              "Augustine",
  "AUG":              "Augustine",
  "AUGUSTINE":        "Augustine",

  // John Chrysostom
  "Chrys":            "John Chrysostom",
  "CHRYS":            "John Chrysostom",
  "CHRYSOSTOM":       "John Chrysostom",

  // Peter Chrysologus
  "Chrysol":          "Peter Chrysologus",
  "Chrysologus":      "Peter Chrysologus",

  // Gregory the Great
  "Greg":             "Gregory the Great",
  "greg":             "Gregory the Great",
  "GREG":             "Gregory the Great",
  "Gregory":          "Gregory the Great",

  // Gregory of Nazianzus
  "Greg NAZ":         "Gregory of Nazianzus",
  "GREG NAZ":         "Gregory of Nazianzus",
  "GREG. NAZ":        "Gregory of Nazianzus",

  // Gregory of Nyssa
  "Greg NYSS":        "Gregory of Nyssa",
  "GREG NYSS":        "Gregory of Nyssa",
  "GREG. NYSS":       "Gregory of Nyssa",

  // Hilary of Poitiers
  "Hil":              "Hilary of Poitiers",
  "Hilary":           "Hilary of Poitiers",

  // Ambrose
  "AMBROSE":          "Ambrose",

  // Jerome
  "JEROME":           "Jerome",

  // Origen
  "ORIGEN":           "Origen",

  // Bede
  "bede":             "Bede",
  "BEDE":             "Bede",

  // Leo the Great
  "Leo":              "Leo the Great",
  "leo":              "Leo the Great",

  // Cyril of Alexandria
  "Cyril":            "Cyril of Alexandria",
  "CYRIL":            "Cyril of Alexandria",
  "Cyril of Alexandria": "Cyril of Alexandria",

  // Eusebius of Caesarea
  "Euseb":            "Eusebius of Caesarea",
  "Eusebius":         "Eusebius of Caesarea",
  "EUSEBIUS":         "Eusebius of Caesarea",

  // Glossa Ordinaria
  "Gloss":            "Glossa Ordinaria",
  "gloss":            "Glossa Ordinaria",
  "GLOSS":            "Glossa Ordinaria",

  // Rabanus Maurus
  "Raban":            "Rabanus Maurus",
  "Rabanus":          "Rabanus Maurus",

  // Remigius of Auxerre
  "Remig":            "Remigius of Auxerre",
  "REMIG":            "Remigius of Auxerre",
  "Remigius":         "Remigius of Auxerre",

  // Athanasius
  "ATHAN":            "Athanasius",
  "ATHANASIUS":       "Athanasius",

  // Theophylact
  "Theophylact":      "Theophylact",
  "THEOPHYL":         "Theophylact",
  "THEOPHYLACT":      "Theophylact",

  // Basil the Great
  "BASIL":            "Basil the Great",

  // John of Damascus
  "DAMASCENE":        "John of Damascus",

  // Dionysius the Areopagite
  "Dionys":           "Dionysius the Areopagite",
  "DIONYSIUS AR":     "Dionysius the Areopagite",

  // Epiphanius
  "EPIPHAN":          "Epiphanius",

  // Maximus the Confessor
  "MAXIM":            "Maximus the Confessor",

  // Titus of Bostra
  "TITUS BOST":       "Titus of Bostra",
  "TITUS BOSTRENSIS": "Titus of Bostra",

  // Isidore
  "ISIDORE PELEUS":   "Isidore of Pelusium",
  "Isidore":          "Isidore of Seville",

  // Cyprian
  "CYPRIAN":          "Cyprian",

  // Haymo of Auxerre
  "HAYMO":            "Haymo of Auxerre",

  // Alcuin
  "ALCUIN":           "Alcuin",

  // Council of Ephesus
  "EX GESTIS CONC. EPH": "Council of Ephesus",
  "The Council of Ephesus": "Council of Ephesus",

  // Greek Expositor
  "GREEK EX":         "Greek Expositor",
  "GREEK EXPOSITOR":  "Greek Expositor",

  // Pseudo-authors
  "Pseudo-Athan":     "Pseudo-Athanasius",
  "Pseudo-Aug":       "Pseudo-Augustine",
  "PSEUDO-AUG":       "Pseudo-Augustine",
  "Pseudo-Augustine": "Pseudo-Augustine",
  "Pseudo-Chrys":     "Pseudo-Chrysostom",
  "PSEUDO-CHRYS":     "Pseudo-Chrysostom",
  "Pseudo-Chys":      "Pseudo-Chrysostom",
  "Psuedo-Chrys":     "Pseudo-Chrysostom",
  "Pseudo-Origen":    "Pseudo-Origen",
  "Pseudo-Jerome":    "Pseudo-Jerome",
  "Pseudo-Basil":     "Pseudo-Basil",
  "PSEUDO-BASIL":     "Pseudo-Basil",
};

/**
 * Expand abbreviated or inconsistently-cased Father names from the Catena Aurea
 * source data into clean display names. Unknown names are returned as-is.
 */
export function normalizeFatherName(name: string | null): string {
  if (!name) return "Unknown";
  return FATHER_NAME_MAP[name] ?? name;
}

// ─── Catena Aurea citation selection ─────────────────────────────────────────
// Implements the priest-facing selection logic described in the Ambo brief.
// Retrieve everything; display a small ranked subset; always allow expansion.

export type EnrichedEntry = {
  blockStart: number;
  blockEnd: number;
  fatherKey: string;       // normalized lowercase — used for deduplication
  fatherName: string;      // clean display name
  citation?: string;
  text: string;
  sourceOrder: number;     // global index across all blocks+entries
  readingStart: number;
  readingEnd: number;
  // Derived overlap values
  overlapStart: number;
  overlapEnd: number;
  overlapLen: number;
  blockLen: number;
  readingLen: number;
  blockMidpoint: number;
  readingMidpoint: number;
  displayScore: number;
};

function getTargetCount(readingLen: number): number {
  if (readingLen <= 10) return 3;
  if (readingLen <= 18) return 4;
  return 5;
}

function scoreEntry(e: Omit<EnrichedEntry, "displayScore">): number {
  let score = 0;

  // 1. Verse-fit — strongest factor
  if (e.blockStart === e.readingStart && e.blockEnd === e.readingEnd) {
    score += 40; // exact match
  } else if (e.blockStart >= e.readingStart && e.blockEnd <= e.readingEnd) {
    score += 30; // fully contained within reading
  } else {
    score += 18; // partial overlap
  }
  // Overlap-density prevents wide blocks that barely clip the reading from
  // outranking tighter, more relevant blocks.
  score += 20 * (e.overlapLen / e.blockLen);

  // 2. Centrality — comments nearer the heart of the pericope rank higher
  const centralityDistance = Math.abs(e.blockMidpoint - e.readingMidpoint);
  const maxDistance = Math.max(1, e.readingLen / 2);
  score += 10 * Math.max(0, 1 - centralityDistance / maxDistance);

  // 3. Brevity preference — tie-softener only, not a dominant rule
  const len = e.text.length;
  if (len <= 450) score += 6;
  else if (len <= 900) score += 3;

  return score;
}

/**
 * Given the full set of matching Catena blocks and the parsed scripture ref,
 * return a small, ranked, non-repetitive list of citations for the default
 * "From the Fathers" surface. The full blocks array is left untouched for
 * the "Show all from Catena Aurea" expansion view.
 */
export function selectDefaultCitations(
  blocks: CatenaBlock[],
  ref: ParsedRef,
): EnrichedEntry[] {
  const readingStart = ref.verseStart;
  const readingEnd   = ref.verseEnd;
  const readingLen   = readingEnd - readingStart + 1;
  const readingMidpoint = (readingStart + readingEnd) / 2;

  // Flatten blocks → individual enriched entries, preserving global source order.
  let sourceOrder = 0;
  const candidates: EnrichedEntry[] = [];

  for (const block of blocks) {
    const overlapStart = Math.max(block.verseStart, readingStart);
    const overlapEnd   = Math.min(block.verseEnd,   readingEnd);
    const overlapLen   = overlapEnd - overlapStart + 1;

    if (overlapLen < 1) {
      sourceOrder += block.entries.length;
      continue;
    }

    const blockLen      = block.verseEnd - block.verseStart + 1;
    const blockMidpoint = (block.verseStart + block.verseEnd) / 2;

    for (const entry of block.entries) {
      const order = sourceOrder++;
      if (!entry.text?.trim()) continue;

      const fatherName = normalizeFatherName(entry.father);
      const base = {
        blockStart: block.verseStart,
        blockEnd:   block.verseEnd,
        fatherKey:  fatherName.toLowerCase(),
        fatherName,
        citation:   entry.citation,
        text:       entry.text,
        sourceOrder: order,
        readingStart,
        readingEnd,
        overlapStart,
        overlapEnd,
        overlapLen,
        blockLen,
        readingLen,
        blockMidpoint,
        readingMidpoint,
      };
      candidates.push({ ...base, displayScore: scoreEntry(base) });
    }
  }

  // Sort: highest score first; earlier source order breaks ties (defers to Aquinas).
  const sorted = [...candidates].sort((a, b) =>
    b.displayScore !== a.displayScore
      ? b.displayScore - a.displayScore
      : a.sourceOrder - b.sourceOrder,
  );

  const targetCount = getTargetCount(readingLen);
  const selected: EnrichedEntry[] = [];
  const usedFathers  = new Set<string>();
  const usedClusters = new Set<string>();
  const clusterKey   = (e: EnrichedEntry) => `${e.overlapStart}-${e.overlapEnd}`;

  // Pass 1: strict — new Father AND new verse cluster
  for (const c of sorted) {
    if (selected.length >= targetCount) break;
    if (usedFathers.has(c.fatherKey))  continue;
    if (usedClusters.has(clusterKey(c))) continue;
    selected.push(c);
    usedFathers.add(c.fatherKey);
    usedClusters.add(clusterKey(c));
  }

  // Pass 2a: first relaxation — repeated Father allowed if verse cluster is new
  for (const c of sorted) {
    if (selected.length >= targetCount) break;
    if (selected.includes(c)) continue;
    if (!usedClusters.has(clusterKey(c))) {
      selected.push(c);
      usedFathers.add(c.fatherKey);
      usedClusters.add(clusterKey(c));
    }
  }

  // Pass 2b: second relaxation — repeated cluster allowed if Father is new
  for (const c of sorted) {
    if (selected.length >= targetCount) break;
    if (selected.includes(c)) continue;
    if (!usedFathers.has(c.fatherKey)) {
      selected.push(c);
      usedFathers.add(c.fatherKey);
      usedClusters.add(clusterKey(c));
    }
  }

  // Pass 3: final relaxation — anything remaining
  for (const c of sorted) {
    if (selected.length >= targetCount) break;
    if (selected.includes(c)) continue;
    selected.push(c);
  }

  // Display order: by overlap start, then display score, then source order
  return selected.sort((a, b) =>
    a.overlapStart !== b.overlapStart ? a.overlapStart - b.overlapStart :
    b.displayScore  !== a.displayScore ? b.displayScore  - a.displayScore :
    a.sourceOrder   - b.sourceOrder,
  );
}
