import { NextRequest, NextResponse } from "next/server"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// POST handler - delegates to the same real Supabase auth flow as GET
export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = formData.get("email") as string || ""
  const password = formData.get("password") as string || ""
  return doQuickLogin(request, email, password)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email") || ""
  const password = searchParams.get("password") || ""
  return doQuickLogin(request, email, password)
}

async function doQuickLogin(request: NextRequest, email: string, password: string) {
  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
  }

  // Call Supabase directly
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  })

  const authData = await authRes.json()

  if (!authRes.ok || authData.error) {
    return NextResponse.json(
      { error: authData.error_description || authData.error || "Login failed" },
      { status: 401 }
    )
  }

  console.log("[auth/quick-login] success:", email)

  // Set session cookies on a response
  const sessionJson = JSON.stringify({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
    user: authData.user,
    token_type: "bearer",
    expires_in: authData.expires_in,
    expires_at: authData.expires_at,
  })
  const encoded = Buffer.from(sessionJson).toString("base64url")
  const chunkSize = 3800
  const chunks = []
  for (let i = 0; i < encoded.length; i += chunkSize) {
    chunks.push(encoded.slice(i, i + chunkSize))
  }

  const cookieName = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`
  const cookieOpts = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    secure: true,
  }

  // In v0 sandbox, 302 redirects don't reliably propagate Set-Cookie headers
  // due to iframe cross-origin restrictions. Instead, return an HTML page that
  // has the cookies set and auto-navigates to /dashboard.
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Login...</title></head>
<body>
<p>Login riuscito, reindirizzamento...</p>
<script>window.location.replace("/dashboard");</script>
</body></html>`

  const response = new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })

  if (chunks.length === 1) {
    response.cookies.set(cookieName, chunks[0], cookieOpts)
  } else {
    chunks.forEach((chunk, i) => {
      response.cookies.set(`${cookieName}.${i}`, chunk, cookieOpts)
    })
  }

  return response
}
