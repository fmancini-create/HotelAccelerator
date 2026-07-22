import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createServerClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Fetch organization separately if needed
    let organization = null
    if (profile.organization_id) {
      const { data: org } = await supabase.from("organizations").select("*").eq("id", profile.organization_id).single()
      organization = org
    }

    const { data: teamMembers, error: teamError } = await supabase
      .from("profiles")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 })
    }

    return NextResponse.json({ teamMembers, organization })
  } catch (error) {
    console.error("Error fetching team members:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
