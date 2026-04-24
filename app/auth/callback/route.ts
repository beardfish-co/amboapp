import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Secondary allowlist check — safety net in case the email was
      // removed from the allowlist after OTP was issued, or the OTP
      // was issued via a different path.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const admin = createAdminClient();
          const { data: allowed } = await admin
            .from("beta_allowlist")
            .select("email")
            .eq("email", user.email.toLowerCase())
            .maybeSingle();

          if (!allowed) {
            await supabase.auth.signOut();
            return NextResponse.redirect(`${origin}/login?error=not_invited`);
          }
        }
      } catch {
        // If the allowlist check itself fails, let the user through —
        // the primary gate at OTP send time is the real control.
      }

      return NextResponse.redirect(`${origin}/`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
