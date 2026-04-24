import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/check-allowlist
 * Body: { email: string }
 * Returns: { allowed: boolean }
 *
 * Called by the login page before sending an OTP, so unauthorised
 * email addresses never receive a magic link.
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
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("beta_allowlist")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      console.error("[check-allowlist] DB error:", error.message);
      // Fail open during development if table doesn't exist yet, fail closed in production
      const isDev = process.env.NODE_ENV === "development";
      return NextResponse.json({ allowed: isDev }, { status: 200 });
    }

    return NextResponse.json({ allowed: !!data }, { status: 200 });
  } catch (err) {
    console.error("[check-allowlist] Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
