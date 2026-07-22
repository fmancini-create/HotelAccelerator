import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    const organizationId = searchParams.get("organizationId")

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    let query = supabase
      .from("alerts")
      .select("*")
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(10)

    if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    } else if (organizationId) {
      query = query.eq("organization_id", organizationId)
    }

    const { data: alerts, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const unreadCount = alerts?.filter((a) => !a.is_read).length || 0

    return NextResponse.json({ alerts: alerts || [], unreadCount })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, is_read, is_dismissed } = body

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const updateData: any = {}
    if (typeof is_read === "boolean") updateData.is_read = is_read
    if (typeof is_dismissed === "boolean") updateData.is_dismissed = is_dismissed

    const { data, error } = await supabase.from("alerts").update(updateData).eq("id", id).select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ alert: data })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
