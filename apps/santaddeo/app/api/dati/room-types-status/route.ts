import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get hotel_id from request body
    const body = await request.json().catch(() => ({}))
    const hotelId = body.hotel_id
    
    console.log("[v0] room-types-status API called with hotel_id:", hotelId)
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    // Get all room types
    const { data: allRoomTypes, error: allError } = await supabase
      .from("room_types")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("name")

    if (allError) {
      throw allError
    }

    // Get active room types
    const activeRoomTypes = allRoomTypes?.filter((rt) => rt.is_active) || []
    const inactiveRoomTypes = allRoomTypes?.filter((rt) => !rt.is_active) || []

    // For each active room type, count availability records
    const activeRoomTypesWithCounts = await Promise.all(
      activeRoomTypes.map(async (rt) => {
        const { count: totalCount } = await supabase
          .from("daily_availability")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .eq("room_type_id", rt.id)

        const { count: nonZeroCount } = await supabase
          .from("daily_availability")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .eq("room_type_id", rt.id)
          .gt("rooms_available", 0)

        return {
          ...rt,
          availabilityCount: totalCount || 0,
          nonZeroCount: nonZeroCount || 0,
        }
      }),
    )

    return NextResponse.json({
      totalRoomTypes: allRoomTypes?.length || 0,
      activeRoomTypes: activeRoomTypes.length,
      inactiveRoomTypes: inactiveRoomTypes.length,
      activeRoomTypesList: activeRoomTypesWithCounts,
      inactiveRoomTypesList: inactiveRoomTypes,
    })
  } catch (error) {
    console.error("[v0] Error checking room types status:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
