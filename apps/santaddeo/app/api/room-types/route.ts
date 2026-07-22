import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotelId")

    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })
    }

    console.log("[v0] Room types API - Loading room types for hotel:", hotelId)

    const supabase = await createServerClient()

    const { data: roomTypes, error } = await supabase
      .from("room_types")
      .select("id, name, code, scidoo_room_type_id, is_active, display_order")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })

    if (error) {
      console.error("[v0] Room types API - Error loading room types:", error)
      return NextResponse.json({ error: "Failed to load room types" }, { status: 500 })
    }

    console.log("[v0] Room types API - Loaded room types:", roomTypes?.length || 0)

    return NextResponse.json({ roomTypes: roomTypes || [] })
  } catch (error) {
    console.error("[v0] Room types API - Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
