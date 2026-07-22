import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    // Get unique room_type_ids from rms_availability_daily
    const { data: availabilityData, error: availError } = await supabase
      .from("rms_availability_daily")
      .select("room_type_id")
      .eq("hotel_id", hotelId)
      .not("room_type_id", "is", null)

    if (availError) {
      console.error("[API] Error fetching availability:", availError)
      return NextResponse.json({ error: availError.message }, { status: 500 })
    }

    // Get unique room_type_ids
    const uniqueRoomTypeIds = [...new Set(availabilityData?.map(a => a.room_type_id) || [])]

    // Get room type names from room_types table if they exist
    const { data: roomTypesData } = await supabase
      .from("room_types")
      .select("id, name, scidoo_room_type_id")
      .eq("hotel_id", hotelId)

    // Map room_type_ids to their names
    const roomTypes = uniqueRoomTypeIds.map(rtId => {
      // Check if this ID is a direct room_type.id
      const directMatch = roomTypesData?.find(rt => rt.id === rtId)
      if (directMatch) {
        return {
          room_type_id: rtId,
          room_type_name: directMatch.name
        }
      }
      
      // Check if this ID matches scidoo_room_type_id
      const scidooMatch = roomTypesData?.find(rt => rt.scidoo_room_type_id === rtId)
      if (scidooMatch) {
        return {
          room_type_id: rtId,
          room_type_name: scidooMatch.name
        }
      }
      
      // No match found, return ID only
      return {
        room_type_id: rtId,
        room_type_name: null
      }
    })

    return NextResponse.json({ roomTypes })
  } catch (error: any) {
    console.error("[API] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
