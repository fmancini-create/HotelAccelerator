import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createClient()

    // Get user and hotel
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userHotels } = await supabase
      .from("user_property_map")
      .select("hotel_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    const hotelId = userHotels?.hotel_id
    if (!hotelId) {
      return NextResponse.json({ error: "No hotel found for user" }, { status: 400 })
    }

    console.log("[v0] Checking data for hotel:", hotelId)

    // Get room types with scidoo_room_type_id
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, code, scidoo_room_type_id, is_active")
      .eq("hotel_id", hotelId)
      .order("name")

    console.log("[v0] Room types:", roomTypes?.length)

    // Get availability records WITH room_type_id
    const { data: availabilityWithRoomType } = await supabase
      .from("daily_availability")
      .select("date, room_type_id, rooms_available")
      .eq("hotel_id", hotelId)
      .not("room_type_id", "is", null)
      .gt("rooms_available", 0)
      .order("date")
      .limit(10)

    console.log("[v0] Availability with room_type_id:", availabilityWithRoomType?.length)

    // Get availability records WITHOUT room_type_id
    const { data: availabilityWithoutRoomType } = await supabase
      .from("daily_availability")
      .select("date, room_type_id, rooms_available")
      .eq("hotel_id", hotelId)
      .is("room_type_id", null)
      .order("date")
      .limit(10)

    console.log("[v0] Availability without room_type_id:", availabilityWithoutRoomType?.length)

    // Get stats
    const { count: totalRecords } = await supabase
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)

    const { count: recordsWithRoomType } = await supabase
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .not("room_type_id", "is", null)

    const { count: recordsWithoutRoomType } = await supabase
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .is("room_type_id", null)

    const { count: nonZeroRecords } = await supabase
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .gt("rooms_available", 0)

    const stats = {
      totalRecords,
      recordsWithRoomType,
      recordsWithoutRoomType,
      nonZeroRecords,
    }

    console.log("[v0] Stats:", stats)

    return NextResponse.json({
      roomTypes,
      availabilityWithRoomType,
      availabilityWithoutRoomType,
      stats,
    })
  } catch (error) {
    console.error("[v0] Error checking data:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
