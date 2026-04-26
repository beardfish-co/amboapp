import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/check-allowlist
 * Body: { email: string }
 * Returns: { allowed: boolean }
 *
 * Uses the service-role (admin) client — beta_allowlist has no RLS policies,
 * so only the service role can read it. This intentionally prevents the
 * allowlist from being enumerable by any regular client.
 */
export async function POST(req: NextRequest) {
  let email: string | undefined;

  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("beta_allowlist")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("[check-allowlist] DB error:", error.message);
      // Fail open on any DB error so infrastructure issues never lock out users
      return NextResponse.json({ allowed: true }, { status: 200 });
    }

    return NextResponse.json({ allowed: !!data }, { status: 200 });
  } catch (err) {
    console.error("[check-allowlist] Unexpected error:", err);
    // Fail open on unexpected errors
    return NextResponse.json({ allowed: true }, { status: 200 });
  }
}
