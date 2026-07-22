import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_superadmin")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "system_admin" && !profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all commission requests with related data
    const { data: requests, error } = await supabase
      .from("commission_plan_requests")
      .select(`
        *,
        hotel:hotels(id, name, total_rooms, city),
        profile:profiles!commission_plan_requests_user_id_fkey(email, first_name, full_name),
        organization:organizations(name, company_name)
      `)
      .order("requested_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching commission requests:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ requests })
  } catch (error) {
    console.error("[v0] Error in commission-requests GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
