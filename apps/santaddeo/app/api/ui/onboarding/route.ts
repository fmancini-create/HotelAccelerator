import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ redirect: "/auth/login" })
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ redirect: "/auth/login?error=profile" })
  }

  // Fast path: setup gia' completato (bandiera esplicita su profiles).
  // Evita roundtrip su organizations + hotels per utenti che hanno gia'
  // finito l'onboarding.
  if (profile?.setup_completed) {
    return NextResponse.json({ redirect: "/dashboard" })
  }

  // Fetch organization separately
  let organization = null
  if (profile?.organization_id) {
    const { data: org } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).single()
    organization = org

    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id")
      .eq("organization_id", profile.organization_id)

    if (hotelsError) {
      return NextResponse.json({ redirect: "/auth/login?error=hotels" })
    }

    if (hotels && hotels.length > 0) {
      return NextResponse.json({ redirect: "/dashboard" })
    }
  }

  return NextResponse.json({
    user,
    profile: profile ? { ...profile, organizations: organization } : null,
  })
}
