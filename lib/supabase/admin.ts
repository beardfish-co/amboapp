// Supabase admin client — uses the service role key, which bypasses RLS.
// Only use server-side in trusted contexts (cron jobs, admin routes).
// Never expose this client to the browser.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
