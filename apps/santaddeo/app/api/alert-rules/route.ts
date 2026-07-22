import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    const organizationId = searchParams.get("organizationId")
    const globalOnly = searchParams.get("global") === "true"

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    let query = supabase.from("alert_rules").select("*").order("created_at", { ascending: false })

    if (globalOnly) {
      query = query.is("hotel_id", null).is("organization_id", null)
    } else if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    } else if (organizationId) {
      query = query.eq("organization_id", organizationId)
    }

    const { data: rules, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rules: rules || [] })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
