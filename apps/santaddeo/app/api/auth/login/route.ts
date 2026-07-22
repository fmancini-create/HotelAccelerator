import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { getPublicSupabaseConfig } from "@/lib/supabase/server"

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getPublicSupabaseConfig()

export async function POST(req: Request) {
  console.log("[v0] LOGIN POST received")
  
  // Support both JSON and FormData content types
  const contentType = req.headers.get("content-type") || ""
  let email: string | null = null
  let password: string | null = null
  
  if (contentType.includes("application/json")) {
    const body = await req.json()
    email = body.email
    password = body.password
  } else {
    const formData = await req.formData()
    email = formData.get("email") as string
    password = formData.get("password") as string
  }
  
  const isJsonRequest = contentType.includes("application/json")

  if (!email || !password) {
    console.log("[v0] LOGIN: missing email or password")
    if (isJsonRequest) {
      return NextResponse.json({ error: "Email e password sono richiesti" }, { status: 400 })
    }
    return NextResponse.redirect(
      new URL("/auth/login?error=Email%20e%20password%20sono%20richiesti", req.url)
    )
  }

  console.log("[v0] LOGIN: authenticating", email)

  // Create response early so we can set cookies on it
  const response = NextResponse.redirect(new URL("/dashboard", req.url), 302)

  // Create Supabase client with cookie handling for Route Handler
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => {
        // No existing cookies for login
        return []
      },
      setAll: (cookiesToSet) => {
        // Set cookies on the redirect response
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            // Must be true for HTTPS domains (including v0 sandbox sb-*.vercel.run)
            secure: true,
          })
        })
      },
    },
  })

  // Authenticate with Supabase - this will automatically set the session cookies
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  console.log("[v0] LOGIN: Supabase response", error ? `error: ${error.message}` : `success: ${data.user?.email}`)

  if (error || !data.session) {
    const msg = error?.message ?? "Credenziali non valide"
    console.log("[v0] LOGIN: authentication failed -", msg)
    if (isJsonRequest) {
      return NextResponse.json({ error: msg }, { status: 401 })
    }
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(msg)}`, req.url)
    )
  }

  // Update last_login_at and determine the correct landing page using the
  // shared resolver. IMPORTANTE: usiamo resolveLanding (che legge
  // `user_property_map` + `organization_id`, la sorgente REALE dell'accesso
  // struttura) invece della vecchia tabella `hotel_users` (deprecata e vuota
  // per i dual-role come i venditori con strutture assegnate). Senza questo,
  // un venditore con accesso tenant veniva mandato dritto a /sales saltando
  // il selettore /auth/choose-profile.
  let redirectPath = "/dashboard"
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const { resolveLanding } = await import("@/lib/auth/resolve-landing")
    const adminClient = await createServiceRoleClient()

    // Update last_login_at
    await adminClient.from("profiles").update({
      last_login_at: new Date().toISOString(),
    }).eq("id", data.user.id)

    const landing = await resolveLanding(adminClient, data.user.id)
    redirectPath = landing.path
    console.log("[v0] LOGIN: resolved landing =", redirectPath)
  } catch (e) {
    console.error("[v0] LOGIN: failed to resolve landing", e)
  }

  console.log("[v0] LOGIN: authenticated successfully, redirecting to", redirectPath)

  // Return an HTML page with session cookies set and auto-redirect to /dashboard.
  // This avoids 302 redirect Set-Cookie propagation issues in v0 sandbox iframe
  // and works reliably for both form submit and fetch-based login flows.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Login...</title></head>
<body>
<p>Login riuscito, reindirizzamento...</p>
<script>window.location.replace("${redirectPath}");</script>
</body></html>`
  
  const htmlResponse = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
  // Copy session cookies from the response object (set by Supabase SSR setAll)
  response.cookies.getAll().forEach((cookie) => {
    htmlResponse.cookies.set(cookie.name, cookie.value, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    })
  })
  return htmlResponse
}
