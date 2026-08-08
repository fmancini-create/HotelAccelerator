/**
 * server.ts - Supabase SSR client for Next.js server components & API routes
 * Always connects to PROD Supabase with SSR cookie handling.
 */
import { cookies } from "next/headers"
import {
  getPublicSupabaseConfig,
  getSupabaseSecretKey,
  getSupabaseUrl,
} from "@/lib/supabase/config"

export { getPublicSupabaseConfig } from "@/lib/supabase/config"

// Safe fetch that strips CR/LF from headers
function makeSafeFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    )
    for (const [k, v] of headers.entries()) {
      headers.set(k, String(v).replace(/[\r\n]+/g, " ").trim())
    }
    return baseFetch(input, { ...init, headers })
  }
}

/**
 * Service-role client: Always PROD, admin access
 * Use for cron jobs, batch operations, internal APIs
 *
 * 21/05/2026: aggiunti `db.schema='public'` esplicito + accessor `.schema(...)`
 * funziona se PostgREST conosce lo schema. Per leggere/scrivere in
 * `connectors.*` (es. brig_raw_bookings, scidoo_raw_bookings) il chiamante
 * usa `.schema("connectors")` su questo client. Senza l'esposizione PostgREST
 * dello schema "connectors" (impostata in Supabase Dashboard -> API Settings
 * -> Exposed schemas), `.schema("connectors")` viene ignorato e cade su
 * public, causando silent no-op (2221 raw mai processati osservato 21/05).
 */
export async function createServiceRoleClient() {
  const safeFetch = makeSafeFetch(globalThis.fetch.bind(globalThis))
  const { createClient } = await import("@supabase/supabase-js")
  return createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
    global: { fetch: safeFetch as typeof fetch },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    db: { schema: "public" },
  })
}

/**
 * SSR client: Always PROD, user auth session from httpOnly cookies
 * Use for server components, middleware, API routes that need user context
 */
export async function createClient() {
  const cookieStore = await cookies()
  const safeFetch = makeSafeFetch(globalThis.fetch.bind(globalThis))
  const { createServerClient } = await import("@supabase/ssr")
  const { url, publishableKey } = getPublicSupabaseConfig()
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* server component context */ }
      },
    },
    global: { fetch: safeFetch },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      // Must match the cookie name set by /api/auth/login: sb-{projectRef}-auth-token
    },
  })
}

/**
 * Get authenticated user from cookies.
 *
 * Usa SOLO `getUser()`, che valida il token contattando l'Auth server di
 * Supabase. NON usa il fallback su `getSession()` perche':
 *  - `getSession()` legge solo dal cookie senza validare la firma,
 *  - accedere a `session.user` lato server triggera il warning ufficiale
 *    Supabase ("could be insecure"),
 *  - se getUser() ritorna null, l'utente NON e' autenticato in modo
 *    affidabile, quindi tornare comunque un user dal cookie sarebbe
 *    un security smell, non un'ottimizzazione.
 */
export async function getAuthUser(supabase?: Awaited<ReturnType<typeof createClient>>) {
  const client = supabase || (await createClient())
  try {
    const { data: userData } = await client.auth.getUser()
    return userData?.user ?? null
  } catch {
    return null
  }
}

// Backward compatibility alias
export const createServerClient = createClient
