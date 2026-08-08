import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/supabase/config"

/** Returns a privileged client for server-only routes and jobs. */
export function getDirectProdClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabaseSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

/** Drop-in async alias for createServiceRoleClient */
export const createServiceRoleClient = async () => getDirectProdClient()
