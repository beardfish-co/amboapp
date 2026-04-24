import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/delete-account
 *
 * Permanently deletes the authenticated user's account and all associated
 * data. The homilies table has ON DELETE CASCADE on user_id, so all homily
 * rows are removed automatically when the auth.users row is deleted.
 *
 * Requires an active session — unauthenticated requests are rejected.
 */
export async function POST() {
  // Verify the caller is authenticated
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Use the admin client to delete from auth.users — this cascades to all
  // application tables via the ON DELETE CASCADE foreign key constraint.
  try {
    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("[delete-account] Failed to delete user:", deleteError.message);
      return NextResponse.json({ error: "Deletion failed. Please contact us." }, { status: 500 });
    }

    // Sign out the session — the user row is gone so the token is invalid anyway
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete-account] Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
