import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

const SUPABASE_URL = "https://aeynirkfixurikshxfov.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleW5pcmtmaXh1cmlrc2h4Zm92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MTQyMDMsImV4cCI6MjA3Njk5MDIwM30.NhCFYvT7fvsuEwvhP7em7vDKifRa6RmnfdVYwUvKWp0"

/**
 * Handles a form POST login and returns a 302 redirect to /dashboard.
 * Cookies are set on the redirect response — the browser follows the redirect
 * in the same navigation, so cookies are honoured even in iframe/sandbox.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = "/auth/login"

  if (!email || !password) {
    loginUrl.searchParams.set("error", "Email e password richiesti")
    return NextResponse.redirect(loginUrl, { status: 302 })
  }

  const pendingCookies: Array<{ name: string; value: string; options: any }> = []

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return [] },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          pendingCookies.push({ name, value, options })
        )
      },
    },
  })

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    const msg = error?.message?.includes("Invalid login credentials")
      ? "Email o password non corretti"
      : error?.message || "Credenziali non valide"
    loginUrl.searchParams.set("error", msg)
    return NextResponse.redirect(loginUrl, { status: 302 })
  }

  console.log("[auth/login-redirect] OK", data.user.email, "cookies:", pendingCookies.map(c => c.name))

  // Update last_login_at and determine the correct landing page (handles
  // dual-role sales agents + tenant access via the shared resolver).
  let redirectPath = "/dashboard"
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const { resolveLanding } = await import("@/lib/auth/resolve-landing")
    const adminClient = await createServiceRoleClient()

    await adminClient.from("profiles").update({
      last_login_at: new Date().toISOString(),
    }).eq("id", data.user.id)

    const landing = await resolveLanding(adminClient, data.user.id)
    redirectPath = landing.path
  } catch (e) {
    console.error("[auth/login-redirect] failed to resolve landing", e)
  }

  const targetUrl = request.nextUrl.clone()
  targetUrl.pathname = redirectPath
  targetUrl.search = ""

  const response = NextResponse.redirect(targetUrl, { status: 302 })

  // Set all Supabase auth cookies on the redirect response
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, { ...options, path: "/" })
  }

  return response
}
