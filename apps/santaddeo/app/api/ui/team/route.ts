import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ redirect: "/auth/login" })
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

  if (!profile) {
    return NextResponse.json({ redirect: "/auth/login" })
  }

  // Fetch organization separately
  let organization = null
  if (profile.organization_id) {
    const { data: org } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).single()
    organization = org
  }

  const { data: teamMembers } = await supabase
    .from("profiles")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })

  return NextResponse.json({
    profile,
    organization,
    teamMembers: teamMembers || [],
  })
}
