import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authorizeUser } from "@/lib/auth/authorize-user"

/**
 * OAuth callback (Google). Supabase redirects here with a `code` that we
 * exchange for a session. We then apply the SAME authorization gate as the
 * password login: only users present in `admin_users` or active `super_admin`
 * collaborators may proceed. Everyone else is signed out and bounced back to
 * the login gate with an "unauthorized" message.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const oauthError = searchParams.get("error")

  // Google returned an error (e.g. user cancelled consent).
  if (oauthError || !code) {
    return NextResponse.redirect(`${origin}/admin?error=oauth`)
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/admin?error=oauth`)
  }

  const result = await authorizeUser(supabase, data.user)

  if (result.authorized) {
    return NextResponse.redirect(`${origin}${result.destination}`)
  }

  // Authenticated with Google but not authorized in this platform.
  await supabase.auth.signOut()
  return NextResponse.redirect(`${origin}/admin?error=unauthorized`)
}
