// POST /api/echo/save
//
// Saves a priest's Echo output (original generated text + edited version) to
// the echo_outputs table. Returns the new row's ID on success.
//
// Request body:
//   {
//     outputType: string,       // one of the five Echo output types
//     variant?: string,         // 'short'|'standard'|'longer' or 'before-sunday'|'after-sunday'
//     generatedText: string,    // original AI output, never to be modified
//     outputText: string,       // priest's current (edited) version
//     homilyId?: string,        // UUID of the source homily, if known
//   }
//
// Response:
//   { id: string }              // UUID of the newly inserted echo_outputs row
//
// Errors:
//   400 -- missing or invalid fields
//   401 -- not authenticated
//   500 -- database or configuration error

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

// Minimal UUID v4 check — rejects empty strings, garbage values, prevents FK violation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: {
    outputType?: string;
    variant?: string;
    generatedText?: string;
    outputText?: string;
    homilyId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { outputType, variant, generatedText, outputText, homilyId } = body;

  if (!outputType || !isValidOutputType(outputType)) {
    return NextResponse.json(
      { error: `outputType must be one of: ${VALID_OUTPUT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!generatedText || typeof generatedText !== "string" || generatedText.trim().length === 0) {
    return NextResponse.json({ error: "generatedText is required" }, { status: 400 });
  }

  if (!outputText || typeof outputText !== "string" || outputText.trim().length === 0) {
    return NextResponse.json({ error: "outputText is required" }, { status: 400 });
  }

  // Validate homilyId if provided — must be a well-formed UUID to satisfy the FK constraint.
  // An empty string or malformed value would cause a DB error; treat those as absent.
  const resolvedHomilyId =
    homilyId && typeof homilyId === "string" && isValidUuid(homilyId) ? homilyId : null;

  const { data, error } = await supabase
    .from("echo_outputs")
    .insert({
      user_id: user.id,
      homily_id: resolvedHomilyId,
      output_type: outputType,
      variant: variant ?? null,
      generated_text: generatedText,
      output_text: outputText,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42P01") {
      // PostgreSQL: undefined_table — echo_outputs table has not been created.
      // Fix: run migrations/010_echo_outputs.sql in the Supabase SQL editor.
      console.error(
        "[echo/save] MIGRATION NOT APPLIED: echo_outputs table does not exist. " +
        "Run migrations/010_echo_outputs.sql in the Supabase dashboard."
      );
    } else {
      console.error("[echo/save] DB insert error:", error.message, error.code);
    }
    return NextResponse.json({ error: "Failed to save output" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
