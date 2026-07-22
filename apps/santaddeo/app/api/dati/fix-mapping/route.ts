import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabase = await createServerClient()
    const hotelId = "b1aa5d38-a044-475c-8d64-6b8f93045395"

    console.log("[v0] Starting fix mapping process...")

    // Step 1: Get scidoo_room_type_id with availability > 0 from raw data
    const { data: rawData, error: rawError } = await supabase
      .from("scidoo_raw_availability")
      .select("raw_data")
      .eq("hotel_id", hotelId)

    if (rawError) throw rawError

    const scidooRoomTypesMap = new Map<string, number>()
    rawData?.forEach((record: any) => {
      const availableCount = Number.parseInt(record.raw_data?.available_count || "0")
      if (availableCount > 0) {
        const roomTypeId = record.raw_data?.room_type_id
        if (roomTypeId) {
          scidooRoomTypesMap.set(roomTypeId, (scidooRoomTypesMap.get(roomTypeId) || 0) + availableCount)
        }
      }
    })

    const scidooRoomTypes = Array.from(scidooRoomTypesMap.entries()).map(([id, count]) => ({
      scidoo_room_type_id: id,
      total_available: count,
    }))

    console.log("[v0] Scidoo room types with availability:", scidooRoomTypes)

    // Step 2: Get existing room_types in SANTADDEO
    const { data: roomTypes, error: roomTypesError } = await supabase
      .from("room_types")
      .select("id, name, scidoo_room_type_id, is_active")
      .eq("hotel_id", hotelId)

    if (roomTypesError) throw roomTypesError

    console.log("[v0] SANTADDEO room types:", roomTypes)

    // Step 3: Identify missing mappings
    const existingMappings = new Set(roomTypes?.map((rt) => rt.scidoo_room_type_id?.toString()).filter(Boolean) || [])

    const missingMappings = scidooRoomTypes.filter((st) => !existingMappings.has(st.scidoo_room_type_id))

    console.log("[v0] Missing mappings:", missingMappings)

    const createdMappings = []
    for (const missing of missingMappings) {
      // Create a new room type for this Scidoo ID
      const { data: newRoomType, error: insertError } = await supabase
        .from("room_types")
        .insert({
          hotel_id: hotelId,
          name: `Room Type ${missing.scidoo_room_type_id}`,
          scidoo_room_type_id: missing.scidoo_room_type_id,
          is_active: true,
          max_occupancy: 2,
          base_price: 100,
        })
        .select()
        .single()

      if (insertError) {
        console.error("[v0] Error creating room type:", insertError)
      } else {
        createdMappings.push({
          room_type_id: newRoomType.id,
          name: newRoomType.name,
          scidoo_room_type_id: missing.scidoo_room_type_id,
          action: "created",
        })
      }
    }

    console.log("[v0] Created mappings:", createdMappings)

    // Step 4: Activate room types that have availability but are inactive
    const roomTypesToActivate =
      roomTypes?.filter((rt) => {
        const scidooId = rt.scidoo_room_type_id?.toString()
        return scidooId && scidooRoomTypes.some((st) => st.scidoo_room_type_id === scidooId) && !rt.is_active
      }) || []

    console.log("[v0] Room types to activate:", roomTypesToActivate)

    const activatedRoomTypes = []
    for (const roomType of roomTypesToActivate) {
      const { error: updateError } = await supabase
        .from("room_types")
        .update({
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", roomType.id)

      if (updateError) {
        console.error("[v0] Error activating room type:", updateError)
      } else {
        activatedRoomTypes.push({
          id: roomType.id,
          name: roomType.name,
          scidoo_room_type_id: roomType.scidoo_room_type_id,
        })
      }
    }

    console.log("[v0] Activated room types:", activatedRoomTypes)

    const { error: deleteError } = await supabase
      .from("daily_availability")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("rooms_available", 0)

    if (deleteError) {
      console.error("[v0] Error deleting old records:", deleteError)
    } else {
      console.log("[v0] Deleted old records with rooms_available = 0")
    }

    return NextResponse.json({
      success: true,
      scidooRoomTypes,
      santaddeoRoomTypes: roomTypes,
      missingMappings,
      createdMappings,
      roomTypesToActivate,
      activatedRoomTypes,
      deletedOldRecords: true,
      message: "Mappings created/updated. Now go to Settings > PMS and click 'Sync Availability' to reload the data.",
    })
  } catch (error: any) {
    console.error("[v0] Error in fix mapping:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
