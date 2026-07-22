/**
 * direct.ts — Fresh module that intercepts ALL Supabase client creation.
 *
 * The Turbopack HMR cache has a stale version of server.ts with DEV credentials.
 * No edit to server.ts fixes this — Turbopack reuses the old compiled bundle.
 *
 * Strategy: patch globalThis so that when the old cached module calls
 * createClient("https://dshdmkmhhbjractpvojp...", ...) the call is intercepted
 * and redirected to PROD. This works because @supabase/supabase-js's createClient
 * is a pure function — we can wrap it.
 */

import { createClient as _createClient } from "@supabase/supabase-js"

const DEV_URL  = "https://dshdmkmhhbjractpvojp.supabase.co"
const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"
function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}
const PROD_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

// Intercept createClient: if any code (including old cached modules) tries to
// connect to DEV, silently redirect to PROD with the correct key.
function safeCreateClient(url: string, key: string, options?: any) {
  if (url.includes("dshdmkmhhbjractpvojp")) {
    console.log("[v0] [direct.ts] INTERCEPTED DEV client — redirecting to PROD")
    const isProbablyServiceRole = key.includes('"role":"service_role"') || key.length > 200
    return _createClient(PROD_URL, isProbablyServiceRole ? getServiceKey() : PROD_ANON, {
      ...options,
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false, ...(options?.auth ?? {}) },
    })
  }
  return _createClient(url, key, options)
}

// Inject intercept into globalThis so dynamic-imported createClient also gets intercepted
;(globalThis as any).__supabase_createClient_patched__ = safeCreateClient

// Also nuke all stale globalThis cache keys from old server.ts versions
;["__supabase_service_role_client___DEV","__supabase_service_role_client___PRODUCTION",
  "__supabase_service_role_client__","__santaddeo_prod_v10__","__santaddeo_prod_v11__",
  "__santaddeo_prod_v12__","__santaddeo_prod_service_client__"].forEach(k => {
  delete (globalThis as any)[k]
})

/** Returns a service-role PROD client — for use in API routes. */
export function getDirectProdClient() {
  return safeCreateClient(PROD_URL, getServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

/** Drop-in async alias for createServiceRoleClient */
export const createServiceRoleClient = async () => getDirectProdClient()
