// FORCE RECOMPILE v3 - Fixed DEV/PROD separation
// ============================================================================
// CONFIGURAZIONE DATABASE SANTADDEO - SEPARAZIONE DEV/PROD
// ============================================================================
// PRODUZIONE (project: aeynirkfixurikshxfov):
//   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// DEV/PREVIEW (project: dshdmkmhhbjractpvojp):
//   - NEXT_PUBLIC_DEV_SUPABASE_URL, NEXT_PUBLIC_DEV_SUPABASE_ANON_KEY
// ============================================================================

// Always use PRODUCTION database - DEV database eliminated to avoid sync issues
function getSupabaseCredentials() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0",
  }
}

const credentials = getSupabaseCredentials()
const SUPABASE_URL = credentials.url
const SUPABASE_ANON_KEY = credentials.anonKey

// Minimal type definition to avoid importing @supabase/supabase-js
// which causes the v0 bundler to load the module and trigger _getUser()
type SupabaseBrowserClient = {
  auth: {
    signOut: () => Promise<{ error: unknown }>
    getSession: () => Promise<{ data: { session: unknown }; error: unknown }>
    getUser: () => Promise<{ data: { user: unknown }; error: unknown }>
    signInWithPassword: (params: { email: string; password: string }) => Promise<{ data: { user: unknown; session: unknown }; error: unknown }>
    signInWithOAuth: (params: unknown) => Promise<{ data: unknown; error: unknown }>
    onAuthStateChange: (event: string, callback: unknown) => { data: { subscription: { unsubscribe: () => void } } }
    resetPasswordForEmail: (email: string) => Promise<{ data: unknown; error: unknown }>
    updateUser: (params: unknown) => Promise<{ data: { user: unknown }; error: unknown }>
    exchangeCodeForSession: (code: string) => Promise<{ data: { session: unknown; user: unknown }; error: unknown }>
  }
  from: (table: string) => unknown
}

let browserClient: SupabaseBrowserClient | null = null
let noOpClient: SupabaseBrowserClient | null = null

function isDevEnvironment(): boolean {
  // Prima controlla la variabile dedicata (impostata manualmente per i diversi ambienti)
  if (process.env.NEXT_PUBLIC_IS_DEV !== undefined) {
    return process.env.NEXT_PUBLIC_IS_DEV === "true"
  }
  
  // v0 preview detection ONLY - the no-op client is ONLY for v0 sandbox
  // where globalThis.fetch is proxied and blocks Supabase calls.
  // In localhost/Vercel preview, Supabase works normally - use real client.
  // NOTE: v0-santaddeo-*.vercel.app is PRODUCTION Vercel deployment, NOT v0 preview!
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname
    // ONLY v0 sandbox environments should use the no-op client
    // Do NOT match v0-*.vercel.app which are Vercel production deployments
    const isV0Sandbox = !!(window as any).__v0__ || 
                        !!(globalThis as any).__v0__ ||
                        hostname.includes("vusercontent.net") ||
                        hostname.includes("v0.app") ||
                        hostname.includes("v0.dev")
    return isV0Sandbox
  }
  
  // Server-side: never use no-op client (server has real fetch)
  return false
}

/**
 * In v0 preview, the sandbox's __v0__.globalThis.fetch proxy intercepts ALL
 * fetch calls and throws "Failed to fetch" for direct supabase.co requests.
 * createBrowserClient() creates a GoTrueClient that always calls _getUser()
 * on init, which triggers this error. This no-op client avoids creating a
 * real GoTrueClient entirely. Login works via /api/auth/login server-side
 * route handler which is not affected by the sandbox.
 */
function createDevNoOpClient(): SupabaseBrowserClient {
  const noOp = {
    auth: {
      signOut: async () => {
        // Clear auth cookie and redirect
        document.cookie = "sb-santaddeo-auth=; path=/; max-age=0"
        window.location.href = "/auth/login"
        return { error: null }
      },
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        // Proxy to server-side route handler (not affected by sandbox)
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            credentials: "include",
          })
          const json = await res.json()
          if (!res.ok || json.error) {
            return {
              data: { user: null, session: null },
              error: { message: json.error || "Login failed", status: res.status },
            }
          }
          // In v0 preview, cookies may not work. Save token to localStorage as fallback.
          if (json.access_token) {
            localStorage.setItem("sb-santaddeo-auth-token", json.access_token)
          }
          return {
            data: { user: json.user, session: { user: json.user, access_token: json.access_token } },
            error: null,
          }
        } catch (e) {
          return {
            data: { user: null, session: null },
            error: { message: "Errore di connessione al server" },
          }
        }
      },
      signInWithOAuth: async () => ({
        data: { url: null, provider: null },
        error: { message: "OAuth non disponibile in anteprima v0" },
      }),
      onAuthStateChange: (_event: string, _callback: unknown) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      resetPasswordForEmail: async () => ({
        data: {},
        error: { message: "Reset password non disponibile in anteprima v0" },
      }),
      updateUser: async () => ({
        data: { user: null },
        error: { message: "Update user non disponibile in anteprima v0" },
      }),
      exchangeCodeForSession: async () => ({
        data: { session: null, user: null },
        error: { message: "Exchange code non disponibile in anteprima v0" },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ data: [], error: null, maybeSingle: async () => ({ data: null, error: null }) }),
        order: () => ({ data: [], error: null }),
        data: [],
        error: null,
      }),
    }),
  } as SupabaseBrowserClient
  return noOp
}

// Promise for async client initialization in production
let clientInitPromise: Promise<SupabaseBrowserClient> | null = null

/**
 * Creates a Supabase browser client.
 * - In v0 preview / dev: returns a no-op client (avoids GoTrueClient _getUser)
 * - In production: returns the real Supabase client (loaded async on first call)
 * 
 * IMPORTANT: In v0 preview, we MUST return the no-op client BEFORE any code
 * can even think about importing @supabase/ssr. The v0 bundler aggressively
 * pre-loads modules from esm.v0.app, and GoTrueClient calls _getUser() on init.
 */
export function createClient(): SupabaseBrowserClient {
  // Return cached client if available
  if (browserClient) return browserClient
  if (noOpClient) return noOpClient

  // CRITICAL: Check dev environment FIRST, before any imports
  const isDev = isDevEnvironment()

  if (isDev) {
    // In dev/preview, return no-op client immediately
    // DO NOT import @supabase/* in this code path
    browserClient = createDevNoOpClient()
    return browserClient
  }

  // Production: start async loading if not already started
  if (!clientInitPromise) {
    clientInitPromise = initProductionClient()
  }

  // Return a proxy that forwards all calls to the real client when ready
  // This allows synchronous createClient() while loading async
  return createProxyClient()
}

/**
 * Initialize the production Supabase client asynchronously.
 * In v0 preview, this function is NEVER called because createClient()
 * returns the noOp client early via isDevEnvironment() check.
 */
async function initProductionClient(): Promise<SupabaseBrowserClient> {
  // Double-check we're not in v0 preview (should never reach here in preview)
  if (isDevEnvironment()) {
    return createDevNoOpClient()
  }
  
  // Standard dynamic import - bundled correctly by Next.js/Turbopack for production
  const { createBrowserClient } = await import("@supabase/ssr")
  const client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: "sb-santaddeo-auth",
    },
  }) as SupabaseBrowserClient
  browserClient = client
  return client
}

/**
 * Create a proxy client that forwards calls to the real client when ready
 */
function createProxyClient(): SupabaseBrowserClient {
  return {
    auth: {
      signOut: async () => {
        const client = await clientInitPromise!
        return client.auth.signOut()
      },
      getSession: async () => {
        const client = await clientInitPromise!
        return client.auth.getSession()
      },
      getUser: async () => {
        const client = await clientInitPromise!
        return client.auth.getUser()
      },
      signInWithPassword: async (params: { email: string; password: string }) => {
        const client = await clientInitPromise!
        return client.auth.signInWithPassword(params)
      },
      signInWithOAuth: async (params: any) => {
        const client = await clientInitPromise!
        return client.auth.signInWithOAuth(params as any)
      },
      onAuthStateChange: (event: string, callback: unknown) => {
        // Set up listener after client is ready
        let subscription = { unsubscribe: () => {} }
        clientInitPromise!.then((client) => {
          const result = client.auth.onAuthStateChange(event, callback)
          subscription = result.data.subscription
        })
        return { data: { subscription } }
      },
      resetPasswordForEmail: async (email: string) => {
        const client = await clientInitPromise!
        return client.auth.resetPasswordForEmail(email)
      },
      updateUser: async (params: unknown) => {
        const client = await clientInitPromise!
        return client.auth.updateUser(params)
      },
      exchangeCodeForSession: async (code: string) => {
        const client = await clientInitPromise!
        return client.auth.exchangeCodeForSession(code)
      },
    },
    from: (table: string) => {
      // Return a thenable query builder that awaits the client
      const getClient = () => clientInitPromise!.then((c) => c.from(table))
      return {
        select: (...args: unknown[]) => {
          const chain: any = {
            eq: (...eqArgs: unknown[]) => ({
              ...chain,
              maybeSingle: () => getClient().then((q: any) => q.select(...args).eq(...eqArgs).maybeSingle()),
              single: () => getClient().then((q: any) => q.select(...args).eq(...eqArgs).single()),
              then: (resolve: Function, reject: Function) =>
                getClient().then((q: any) => q.select(...args).eq(...eqArgs)).then(resolve, reject),
            }),
            order: (...orderArgs: unknown[]) => ({
              ...chain,
              then: (resolve: Function, reject: Function) =>
                getClient().then((q: any) => q.select(...args).order(...orderArgs)).then(resolve, reject),
            }),
            then: (resolve: Function, reject: Function) =>
              getClient().then((q: any) => q.select(...args)).then(resolve, reject),
          }
          return chain
        },
      }
    },
  } as SupabaseBrowserClient
}

// Alias per compatibilita' con vecchi import
export function getSupabaseClient(): SupabaseBrowserClient {
  return createClient()
}

export function getSupabaseBrowserClient(): SupabaseBrowserClient {
  return createClient()
}

// Export the type for consumers
export type { SupabaseBrowserClient }
