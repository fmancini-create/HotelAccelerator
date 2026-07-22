import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST() {
  try {
    const supabase = await createClient()

    // Get user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get hotel_id from user_property_map
    const { data: propertyMap, error: propertyError } = await supabase
      .from("user_property_map")
      .select("hotel_id")
      .eq("user_id", user.id)
      .single()

    if (propertyError || !propertyMap) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }

    const hotelId = propertyMap.hotel_id

    console.log("[v0] Cleanup - Starting cleanup for hotel:", hotelId)

    const supabaseAdmin = supabase // use same authenticated client

    // Count records before cleanup
    const { count: beforeCount } = await supabaseAdmin
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)

    const { count: nullCount } = await supabaseAdmin
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .is("room_type_id", null)

    console.log("[v0] Cleanup - Records before:", beforeCount)
    console.log("[v0] Cleanup - Records with null room_type_id:", nullCount)

    // Delete all records with room_type_id null using service role
    const { error: deleteError, count: deletedCount } = await supabaseAdmin
      .from("daily_availability")
      .delete({ count: "exact" })
      .eq("hotel_id", hotelId)
      .is("room_type_id", null)

    if (deleteError) {
      console.error("[v0] Cleanup - Delete error:", deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    console.log("[v0] Cleanup - Deleted count from query:", deletedCount)

    // Count records after cleanup
    const { count: afterCount } = await supabaseAdmin
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)

    console.log("[v0] Cleanup - Records after:", afterCount)
    console.log("[v0] Cleanup - Deleted records:", (beforeCount || 0) - (afterCount || 0))

    return NextResponse.json({
      success: true,
      beforeCount,
      nullCount,
      afterCount,
      deletedCount: (beforeCount || 0) - (afterCount || 0),
    })
  } catch (error) {
    console.error("[v0] Cleanup - Error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
