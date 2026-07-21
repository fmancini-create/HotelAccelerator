import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

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
