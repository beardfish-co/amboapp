// app/api/stripe/subscription/route.ts
// GET — returns the current user's subscription row.
//       If no row exists, creates one with a 6-week trial.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_DAYS } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const admin = createAdminClient();
    let { data: sub } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // First login — initialise trial row
    if (!sub) {
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const { data: newSub } = await admin
        .from("subscriptions")
        .insert({
          user_id:   user.id,
          status:    "trialing",
          trial_end: trialEnd.toISOString(),
        })
        .select()
        .single();
      sub = newSub;
    }

    return NextResponse.json(sub);
  } catch (err) {
    console.error("[stripe/subscription]", err);
    return NextResponse.json({ error: "Failed to load subscription" }, { status: 500 });
  }
}
