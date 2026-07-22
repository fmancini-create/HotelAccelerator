import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get("organizationId")

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required" }, { status: 400 })
    }

    const { data: teamMembers, error } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ members: teamMembers || [] })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
