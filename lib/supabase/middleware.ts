import { createServerClient } from "@supabase/ssr"
import type { NextRequest, NextResponse } from "next/server"

type PendingCookie = { name: string; value: string; options?: Record<string, unknown> }

/**
 * Reads the authenticated user inside the proxy/middleware using the request
 * cookies, and returns a helper to copy any refreshed auth cookies onto the
 * response we ultimately send. Keeping the cookie write separate lets the proxy
 * preserve its tenant-resolution response while still refreshing the session
 * (avoids intermittent logouts).
 */
export async function readMiddlewareUser(
  request: NextRequest,
): Promise<{ user: { id: string; email?: string | null } | null; applyCookies: (response: NextResponse) => void }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { user: null, applyCookies: () => {} }
  }

  const pending: PendingCookie[] = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) pending.push(c)
      },
    },
  })

  let user: { id: string; email?: string | null } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user ?? null
  } catch {
    user = null
  }

  const applyCookies = (response: NextResponse) => {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, options as never)
    }
  }

  return { user, applyCookies }
}
