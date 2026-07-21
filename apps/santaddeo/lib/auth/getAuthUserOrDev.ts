import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * Returns the authenticated user + a Supabase client for DB queries.
 * 
 * DEV (vusercontent.net / localhost / NODE_ENV=development):
 *   - Returns a fake stable user (super_admin).
 *   - supabase.auth.getUser() is NEVER called.
 *   - Returns a SERVICE ROLE client that bypasses RLS
 *     (the fake user has no real Supabase session, so anon+RLS returns 0 rows).
 * 
 * PRODUCTION:
 *   - Uses cookie-based Supabase auth as normal.
 *   - Returns a cookie-bound client that respects RLS via auth.uid().
 */

const DEV_USER = {
  id: "5de43b7b-e661-4e4e-8177-7943df06470c",
  email: "f.mancini@4bid.it",
  role: "super_admin",
  user_metadata: { role: "super_admin" },
}

export async function getAuthUserOrDev() {
  const isDev = await isDevAuthAsync()

  if (isDev) {
    // Service role client bypasses RLS -- required because the fake user
    // has no real Supabase session, so auth.uid() is NULL and all
    // RLS-protected queries would return empty arrays.
    const supabase = await createServiceRoleClient()
    return { user: DEV_USER, supabase }
  }

  // PRODUCTION: cookie-based auth, respects RLS
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return { user, supabase }
}
