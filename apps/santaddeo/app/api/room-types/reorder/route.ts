import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { roomTypeIds, hotelId } = await request.json()

    if (!roomTypeIds || !Array.isArray(roomTypeIds) || !hotelId) {
      return NextResponse.json({ error: "Invalid request: roomTypeIds array and hotelId required" }, { status: 400 })
    }

    console.log("[v0] Reordering room types:", { hotelId, roomTypeIds })

    // Update display_order for each room type
    const updates = roomTypeIds.map((roomTypeId, index) => {
      return supabase
        .from("room_types")
        .update({ display_order: index + 1 })
        .eq("id", roomTypeId)
        .eq("hotel_id", hotelId)
    })

    const results = await Promise.all(updates)

    // Check for errors
    const errors = results.filter((result) => result.error)
    if (errors.length > 0) {
      console.error("[v0] Error updating room types order:", errors)
      return NextResponse.json({ error: "Failed to update room types order" }, { status: 500 })
    }

    console.log("[v0] Successfully reordered room types")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in reorder API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
