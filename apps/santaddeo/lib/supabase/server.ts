/**
 * server.ts - Supabase SSR client for Next.js server components & API routes
 * Always connects to PROD Supabase with SSR cookie handling.
 */
import { cookies } from "next/headers"

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}

// L'anon key e' pubblica per design: la stessa appare nel bundle browser
// ed e' protetta solo dalle RLS lato Supabase. La teniamo qui hardcoded
// perche' alcune API route (login, session-handler) potrebbero girare
// in contesti dove gli env NEXT_PUBLIC_* non sono propagati (v0 sandbox,
// edge runtime). Esportiamo un helper per centralizzare l'accesso.
const PROD_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

/**
 * Public Supabase config (URL + anon key). Da usare invece di duplicare
 * l'hardcode nei singoli route handler.
 */
export function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || PROD_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PROD_ANON_KEY,
  }
}

// Global fetch interceptor - installed once
;(function installFetchInterceptor() {
  const g = globalThis as any
  if (g.__santaddeo_fetch_interceptor_installed__) return
  const originalFetch = g.fetch.bind(g)
  g.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url
    // Redirect dev requests to prod
    if (url.includes("dshdmkmhhbjractpvojp")) {
      const prodUrl = url.replace("dshdmkmhhbjractpvojp", "aeynirkfixurikshxfov")
      const headers = new Headers(init?.headers || {})
      const sk = getServiceKey()
      headers.set("apikey", sk)
      headers.set("Authorization", `Bearer ${sk}`)
      return originalFetch(prodUrl, { ...init, headers })
    }
    return originalFetch(input, init)
  }
  g.__santaddeo_fetch_interceptor_installed__ = true
})()

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
  return createClient(PROD_URL, getServiceKey(), {
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
  return createServerClient(PROD_URL, PROD_ANON_KEY, {
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
      storageKey: "sb-aeynirkfixurikshxfov-auth-token",
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
