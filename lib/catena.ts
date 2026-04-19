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
