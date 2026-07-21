import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Demo user per la v0 preview, allineato a getSettingsData (V0_DEMO_USER).
const V0_DEMO_USER_ID = "5de43b7b-e661-4e4e-8177-7943df06470c"
const V0_DEMO_USER_EMAIL = "f.mancini@4bid.it"

export async function GET() {
  try {
    // FIX 30/05/2026: in preview (v0 chat / localhost) non c'e' una sessione
    // Supabase, quindi getUser() era null e /api/me rispondeva 401. Le pagine
    // che leggono il ruolo da qui (es. /accelerator/onboarding) si
    // comportavano come "utente non autorizzato". Allineiamo al pattern di
    // getSettingsData: in preview usiamo il demo user + service role client.
    const isV0Preview = await isDevAuthAsync()

    if (isV0Preview) {
      const admin = await createServiceRoleClient()
      const { data: profile } = await admin
        .from("profiles")
        .select("id, email, role, organization_id, first_name, last_name, created_at")
        .eq("id", V0_DEMO_USER_ID)
        .maybeSingle()

      let organization = null
      if (profile?.organization_id) {
        const { data: org } = await admin
          .from("organizations")
          .select("id, name, type, created_at")
          .eq("id", profile.organization_id)
          .single()
        organization = org
      }

      return NextResponse.json({
        user: { id: V0_DEMO_USER_ID, email: profile?.email || V0_DEMO_USER_EMAIL },
        profile,
        organization,
      })
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, organization_id, first_name, last_name, created_at")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Fetch organization if profile has one
    let organization = null
    if (profile?.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name, type, created_at")
        .eq("id", profile.organization_id)
        .single()
      organization = org
    }

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      profile,
      organization,
    })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
