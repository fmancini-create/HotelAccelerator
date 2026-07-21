/**
 * prod-client.ts v13 - ALWAYS connects to PROD Supabase.
 * DEV project (dshdmkmhhbjractpvojp) DECOMMISSIONED.
 *
 * v13 adds a globalThis fetch interceptor that rewrites any request
 * targeting the stale DEV project URL to the PROD URL instead.
 * This catches ALL stale HMR-cached modules regardless of how they
 * construct their Supabase client.
 */
import { cookies } from "next/headers"

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"
const DEV_URL  = "https://dshdmkmhhbjractpvojp.supabase.co"
function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
  return key
}
const PROD_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

// ─── Global fetch interceptor ────────────────────────────────────────────────
// Installed once. Any HTTP request to the decommissioned DEV project
// is silently redirected to PROD with the PROD service-role key.
// This fixes ALL stale HMR-cached modules in one place.
;(function installDevToProdInterceptor() {
  const g = globalThis as any
  if (g.__santaddeo_fetch_interceptor_v13__) return // already installed
  const originalFetch = g.fetch.bind(g)
  g.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url
    if (url.includes("dshdmkmhhbjractpvojp")) {
      // Rewrite DEV → PROD URL
      const prodUrl = url.replace("dshdmkmhhbjractpvojp", "aeynirkfixurikshxfov")
      // Replace auth headers with PROD service-role key
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      )
      headers.set("apikey", getServiceKey())
      headers.set("Authorization", `Bearer ${getServiceKey()}`)
      return originalFetch(prodUrl, { ...init, headers })
    }
    return originalFetch(input, init)
  }
  g.__santaddeo_fetch_interceptor_v13__ = true
})()

// ─── safe fetch (strips CR/LF from headers) ──────────────────────────────────
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

// ─── Service-role client (no globalThis cache — always fresh, always PROD) ───
export async function createServiceRoleClient() {
  const safeFetch = makeSafeFetch(globalThis.fetch.bind(globalThis))
  const { createClient } = await import("@supabase/supabase-js")
  const client = createClient(PROD_URL, getServiceKey(), {
    global: { fetch: safeFetch as typeof fetch },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return client
}

/** Alias for backwards compat */
export const getProdServiceClient = createServiceRoleClient

// ─── SSR cookie-based client (for auth routes & server components) ────────────
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
        } catch { /* server component — ignore */ }
      },
    },
    global: { fetch: safeFetch },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storageKey: "sb-santaddeo-auth",
    },
  })
}

/** Alias */
export const createServerClient = createClient

// ─── Auth helper ──────────────────────────────────────────────────────────────
export async function getAuthUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user ?? null
  } catch {
    return null
  }
}
