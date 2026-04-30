// GET /api/echo/archive
//
// Returns the authenticated priest's saved Echo outputs, ordered by
// created_at descending. Joins with homilies to surface title and sunday_date.
//
// Optional query params:
//   ?homilyId=xxx  — filter to outputs for a specific homily
//
// Response shape:
//   {
//     outputs: Array<{
//       id: string
//       output_type: string
//       variant: string | null
//       output_text: string
//       generated_text: string
//       homily_id: string | null
//       created_at: string
//       updated_at: string
//       homily_title: string | null
//       homily_sunday_date: string | null
//     }>
//   }
//
// Errors:
//   401 -- not authenticated
//   500 -- database error

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const homilyId = req.nextUrl.searchParams.get("homilyId");

  let query = supabase
    .from("echo_outputs")
    .select(
      `
      id,
      output_type,
      variant,
      output_text,
      generated_text,
      homily_id,
      created_at,
      updated_at,
      homilies (
        title,
        sunday_date
      )
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (homilyId) {
    query = query.eq("homily_id", homilyId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[echo/archive] DB query error:", error.message);
    return NextResponse.json(
      { error: "Failed to load archive" },
      { status: 500 },
    );
  }

  // Flatten the homilies join into top-level fields
  const outputs = (data ?? []).map((row) => {
    const homily = Array.isArray(row.homilies)
      ? row.homilies[0] ?? null
      : (row.homilies as { title?: string; sunday_date?: string } | null);

    return {
      id: row.id,
      output_type: row.output_type,
      variant: row.variant,
      output_text: row.output_text,
      generated_text: row.generated_text,
      homily_id: row.homily_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      homily_title: homily?.title ?? null,
      homily_sunday_date: homily?.sunday_date ?? null,
    };
  });

  return NextResponse.json({ outputs });
}
