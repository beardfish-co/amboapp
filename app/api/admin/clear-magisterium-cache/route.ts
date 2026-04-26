// DELETE /api/admin/clear-magisterium-cache?date=YYYYMMDD
//
// One-time admin utility: removes a stale magisterium_cache row so the entry
// regenerates on next request. Uses service role to bypass RLS.
// Restrict to admin use — not exposed in any UI.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{8}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid ?date=YYYYMMDD param" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("magisterium_cache")
    .delete()
    .eq("date", date);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cleared: date });
}
