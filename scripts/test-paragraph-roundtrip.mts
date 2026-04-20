// Round-trip smoke test for the Paragraph[] <-> Tiptap adapter.
//
// Asserts that for each fixture:
//   content
//     -> parseParagraphs
//     -> paragraphsToHtml
//     -> Tiptap parser (generateJSON with StarterKit)
//     -> paragraphsFromDoc
//     -> joinParagraphs
//     == content   (lossless round-trip of the stored string)
//
// Also checks a second pass to catch any divergence that only shows up on
// the second round (e.g. citation whitespace, edge-mark corruption).
//
// Run with:  npx tsx scripts/test-paragraph-roundtrip.ts

import { JSDOM } from "jsdom";

// Tiptap uses DOMParser / document / window at parse time. Install them
// globally before anything from @tiptap/* is imported.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as unknown as {
  window: Window;
  document: Document;
  DOMParser: typeof DOMParser;
  navigator: Navigator;
  HTMLElement: typeof HTMLElement;
  Node: typeof Node;
};
g.window = dom.window as unknown as Window;
g.document = dom.window.document;
g.DOMParser = dom.window.DOMParser as unknown as typeof DOMParser;
try { g.navigator = dom.window.navigator; } catch { /* navigator may be getter-only */ }
g.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement;
g.Node = dom.window.Node as unknown as typeof Node;

// Now it's safe to load the Tiptap pieces.
const { generateJSON } = await import("@tiptap/core");
const StarterKitMod = await import("@tiptap/starter-kit");
const StarterKit = (StarterKitMod.default ?? StarterKitMod) as unknown as {
  configure: (opts?: Record<string, unknown>) => unknown;
};

// Load the adapter we're testing.
import type { Paragraph } from "../lib/paragraph-tiptap";
const { paragraphsToHtml, paragraphsFromDoc } = await import(
  "../lib/paragraph-tiptap"
);
type P = Paragraph;

// --- parseParagraphs / joinParagraphs --------------------------------------
// Mirror of the helpers in app/components/WriteView.tsx. They own the DB
// contract; this test is pointless if they drift. If you edit the ones in
// WriteView, edit these too (and add a fixture covering the change).

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function parseParagraphs(text: string): P[] {
  return text
    .split("\n\n")
    .map((block) => block.replace(/[ \t]+$|^[ \t]+/g, ""))
    .map((block): P => {
      if (block === "") return { id: generateId(), text: "" };
      const lines = block.split("\n");
      const hasQuoteMarker = lines.some((l) => l.startsWith("> "));
      if (hasQuoteMarker) {
        let citation: string | undefined;
        if (lines.length > 0 && /^—\s+/.test(lines[lines.length - 1])) {
          citation = lines[lines.length - 1].replace(/^—\s+/, "").trim();
          lines.pop();
        }
        const quoteText = lines
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n")
          .trim();
        return { id: generateId(), text: quoteText, kind: "quote", citation };
      }
      return { id: generateId(), text: block };
    });
}

function joinParagraphs(paragraphs: P[]): string {
  return paragraphs
    .map((p) => {
      if (p.kind === "quote") {
        const lines = (p.text ?? "").split("\n").map((l) => "> " + l).join("\n");
        const citationLine = p.citation ? "— " + p.citation : "";
        return citationLine ? lines + "\n" + citationLine : lines;
      }
      return p.text;
    })
    .join("\n\n");
}

// --- Round-trip machinery --------------------------------------------------

const extensions = [StarterKit.configure()] as Parameters<typeof generateJSON>[1];

function roundTrip(content: string): string {
  const paras = parseParagraphs(content);
  const html = paragraphsToHtml(paras);
  const doc = generateJSON(html, extensions);
  const backParas = paragraphsFromDoc(doc);
  return joinParagraphs(backParas);
}

// --- Fixtures --------------------------------------------------------------

type Fixture = { name: string; content: string };
const fixtures: Fixture[] = [
  {
    name: "single plain paragraph",
    content: "The Lord is my shepherd.",
  },
  {
    name: "multiple plain paragraphs",
    content: "First paragraph.\n\nSecond paragraph.\n\nThird.",
  },
  {
    name: "empty paragraph between bodies (breath)",
    content: "Opening line.\n\n\n\nAfter the breath.",
  },
  {
    name: "inline bold",
    content: "He said, **truly I say to you**, and they listened.",
  },
  {
    name: "inline italic",
    content: "The word was *made flesh* and dwelt among us.",
  },
  {
    name: "bold + italic nested",
    content: "Hear, ***O Israel***, the Lord our God is one.",
  },
  {
    name: "bold at start and italic at end",
    content: "**Behold** the lamb who takes *away the sin of the world*",
  },
  {
    name: "single-line quote without citation",
    content: "> Be still and know that I am God.",
  },
  {
    name: "single-line quote with citation",
    content: "> Be still and know that I am God.\n— Psalm 46:10",
  },
  {
    name: "multi-line quote with citation",
    content:
      "> In the beginning was the Word,\n> and the Word was with God,\n> and the Word was God.\n— John 1:1",
  },
  {
    name: "quote with inline marks + citation",
    content:
      "> Come to me, all you who are **weary** and *burdened*.\n— Matthew 11:28",
  },
  {
    name: "body, quote, body",
    content:
      "Opening reflection on the reading.\n\n> Blessed are the poor in spirit.\n— Matthew 5:3\n\nAnd so we are called to poverty of spirit in our own lives.",
  },
  {
    name: "body with trailing empty + quote",
    content: "Setup line.\n\n\n\n> Quote line.\n— Source",
  },
  {
    name: "quote only, no body",
    content: "> Standalone quote.\n— Someone",
  },
  {
    name: "paragraph with single italic word",
    content: "The *way*.",
  },
  {
    name: "realistic short homily",
    content:
      "Good morning, and welcome to the fourth Sunday of Easter.\n\nToday's gospel speaks of the Good Shepherd.\n\n> I am the good shepherd. The good shepherd lays down his life for the sheep.\n— John 10:11\n\nWhat does it mean, in **our** time, to hear this voice? I want to suggest three things.\n\nFirst, that we are *known*. Not as abstractions, not as a crowd, but one by one.",
  },
];

// --- Run ------------------------------------------------------------------

let failed = 0;
let passed = 0;
for (const f of fixtures) {
  const once = roundTrip(f.content);
  const twice = roundTrip(once);
  const okOnce = once === f.content;
  const okTwice = twice === once;
  if (okOnce && okTwice) {
    passed++;
    process.stdout.write(`  ok  ${f.name}\n`);
    continue;
  }
  failed++;
  process.stdout.write(`FAIL  ${f.name}\n`);
  if (!okOnce) {
    process.stdout.write(
      `      first pass differs\n` +
        `      expected: ${JSON.stringify(f.content)}\n` +
        `      got:      ${JSON.stringify(once)}\n`,
    );
  }
  if (!okTwice) {
    process.stdout.write(
      `      second pass drifted\n` +
        `      first:  ${JSON.stringify(once)}\n` +
        `      second: ${JSON.stringify(twice)}\n`,
    );
  }
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
