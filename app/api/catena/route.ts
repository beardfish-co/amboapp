import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CatenaBlock,
  CatenaGospel,
  findMatchingBlocks,
  parseScriptureRef,
} from "@/lib/catena";

// Module-level cache — each gospel's JSON is loaded once per process.
const cache = new Map<CatenaGospel, CatenaBlock[]>();

async function loadGospel(gospel: CatenaGospel): Promise<CatenaBlock[]> {
  const cached = cache.get(gospel);
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "catena", `${gospel}.json`);
  const text = await fs.readFile(file, "utf-8");
  const blocks = JSON.parse(text) as CatenaBlock[];
  cache.set(gospel, blocks);
  return blocks;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");

  if (!ref) {
    return NextResponse.json({ error: "Missing ?ref=" }, { status: 400 });
  }

  const parsed = parseScriptureRef(ref);
  if (!parsed) {
    return NextResponse.json({ ref, blocks: [], unsupported: true });
  }

  try {
    const all = await loadGospel(parsed.gospel);
    const matches = findMatchingBlocks(parsed, all);
    return NextResponse.json({
      ref,
      parsed,
      blocks: matches,
    });
  } catch (err) {
    console.error("Catena API error:", err);
    return NextResponse.json(
      { error: "Failed to load Catena data" },
      { status: 500 },
    );
  }
}
