import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/services/scidoo-client"

export async function POST(request: NextRequest) {
  try {
    const { hotelId } = await request.json()

    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    // Get PMS integration for this hotel (any PMS, not just scidoo)
    const { data: pmsIntegration, error: pmsError } = await supabase
      .from("pms_integrations")
      .select("*")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    if (pmsError || !pmsIntegration) {
      return NextResponse.json({ error: "Nessuna integrazione PMS configurata per questo hotel" }, { status: 404 })
    }

    if (!pmsIntegration.is_active) {
      return NextResponse.json({ error: "PMS integration is not active" }, { status: 400 })
    }

    // Initialize Scidoo client
    const scidooClient = new ScidooClient({
      apiKey: pmsIntegration.api_key,
      propertyId: pmsIntegration.property_id,
    })

    // Fetch room types from Scidoo
    const roomTypes = await scidooClient.getRoomTypes()

    const roomTypesToInsert = roomTypes.map((rt) => {
      const maxOcc = rt.capacity || rt.capacity_default || 2
      const baseOcc = rt.capacity_default || rt.capacity || 2
      // min_occupancy = 1 (always allow single occupancy)
      // max_occupancy = capacity (total max guests including additional beds)
      return {
        hotel_id: hotelId,
        code: rt.name
          .toUpperCase()
          .replace(/\s+/g, "_")
          .replace(/[^A-Z0-9_]/g, ""), // Generate code from name
        scidoo_room_type_id: rt.id.toString(),
        name: rt.name,
        capacity: maxOcc,
        capacity_default: baseOcc,
        min_occupancy: 1,
        max_occupancy: maxOcc,
        total_rooms: rt.rooms || 1,
        size_sqm: rt.size || null,
        additional_beds: rt.additional_beds || 0,
        is_active: true, // Default to active when first imported
      }
    })

    // Delete existing room types for this hotel
    const { error: deleteError } = await supabase.from("room_types").delete().eq("hotel_id", hotelId)

    if (deleteError) {
      return NextResponse.json({ error: "Errore eliminazione room types esistenti" }, { status: 500 })
    }

    // Insert new room types
    const { data: insertedRoomTypes, error: insertError } = await supabase
      .from("room_types")
      .insert(roomTypesToInsert)
      .select()

    if (insertError) {
      return NextResponse.json({ error: "Errore salvataggio room types" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: insertedRoomTypes.length,
      roomTypes: insertedRoomTypes,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Errore sconosciuto" }, { status: 500 })
  }
}
