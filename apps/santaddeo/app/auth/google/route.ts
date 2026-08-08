import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { getPublicSupabaseConfig } from "@/lib/supabase/config"
const { url: SUPABASE_URL, publishableKey: SUPABASE_ANON_KEY } = getPublicSupabaseConfig()

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const cookieStore = await cookies()

  // Collect cookies that Supabase needs to set (PKCE code_verifier)
  const cookiesToReturn: { name: string; value: string; options: any }[] = []

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesToReturn.push({ name, value, options })
            try {
              cookieStore.set(name, value, options)
            } catch {
              // May throw in some contexts
            }
          })
        },
      },
    }
  )

  // Determine origin
  const forwardedHost = request.headers.get("x-forwarded-host")
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https"
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : requestUrl.origin

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  })
  
  if (error) {
    console.error("Google OAuth error:", error)
    return NextResponse.redirect(
      new URL(`/auth/login?error=oauth_error&message=${encodeURIComponent(error.message)}`, requestUrl.origin)
    )
  }
  
  if (data?.url) {
    // Create redirect response with 302 status and attach PKCE cookies
    const response = NextResponse.redirect(data.url, { status: 302 })
    for (const cookie of cookiesToReturn) {
      response.cookies.set(cookie.name, cookie.value, cookie.options)
    }
    return response
  }
  
  return NextResponse.redirect(new URL("/auth/login?error=oauth_error", requestUrl.origin))
}
