import { createServerClient as createSupabaseServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Creates a new Supabase server client for each request.
 *
 * IMPORTANT: Do NOT cache this client in serverless environments.
 * Each request must have its own client instance to:
 * 1. Prevent memory leaks
 * 2. Ensure proper cookie handling per request
 * 3. Avoid cross-tenant data contamination
 */
export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Missing Supabase environment variables. URL: ${supabaseUrl ? "set" : "missing"}, Key: ${supabaseAnonKey ? "set" : "missing"}`,
    )
  }

  return createSupabaseServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Server Component - ignore cookie setting errors
        }
      },
    },
  })
}

export async function createClientWithToken(accessToken?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Missing Supabase environment variables. URL: ${supabaseUrl ? "set" : "missing"}, Key: ${supabaseAnonKey ? "set" : "missing"}`,
    )
  }

  // If we have a token, use it directly
  if (accessToken) {
    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
    return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    })
  }

  // Otherwise, fall back to cookie-based auth
  return createClient()
}

export { createClient as createServerClient }
