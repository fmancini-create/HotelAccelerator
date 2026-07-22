import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Hardcoded PROD credentials as fallback
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

// Handle both GET and POST for Google OAuth initiation
async function handleGoogleAuth(req: Request) {
  const cookieStore = await cookies()

  // Collect cookies that Supabase needs to set (e.g. PKCE code_verifier)
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
          // Save cookies to set on the response later
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesToReturn.push({ name, value, options })
            try {
              cookieStore.set(name, value, options)
            } catch {
              // cookieStore.set may throw in some contexts
            }
          })
        },
      },
    }
  )

  // Determine the correct origin for the redirect URL
  const reqUrl = new URL(req.url)
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https"
  const origin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : reqUrl.origin !== "http://localhost:3000"
      ? reqUrl.origin
      : "https://www.santaddeo.com"
  const redirectTo = `${origin}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  })

  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, req.url)
    )
  }

  if (data.url) {
    // Create redirect response with 302 status and attach PKCE cookies
    const response = NextResponse.redirect(data.url, { status: 302 })
    for (const cookie of cookiesToReturn) {
      response.cookies.set(cookie.name, cookie.value, cookie.options)
    }
    return response
  }

  return NextResponse.redirect(new URL("/auth/login?error=Errore OAuth", req.url))
}

// Export both GET and POST handlers
export async function GET(req: Request) {
  return handleGoogleAuth(req)
}

export async function POST(req: Request) {
  return handleGoogleAuth(req)
}
