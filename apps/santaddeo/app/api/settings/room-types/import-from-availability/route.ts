import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

export const dynamic = "force-dynamic"

// POST: Import room types from rms_availability_daily data
// This is useful for GSheets/GDocs hotels that have availability data but no room_types configured
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { hotelId } = body
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId is required" }, { status: 400 })
    }
    
    // Get existing room types for this hotel
    const { data: existingRoomTypes } = await supabase
      .from("room_types")
      .select("id, scidoo_room_type_id")
      .eq("hotel_id", hotelId)
    
    const existingIds = new Set(existingRoomTypes?.map(rt => rt.id) || [])
    const existingScidooIds = new Set(existingRoomTypes?.map(rt => rt.scidoo_room_type_id) || [])
    
    // Get distinct room_type_ids from rms_availability_daily
    const { data: availabilityData, error: availError } = await supabase
      .from("rms_availability_daily")
      .select("room_type_id, total_rooms")
      .eq("hotel_id", hotelId)
      .order("date", { ascending: false })
    
    if (availError) {
      console.error("Error fetching availability data:", availError)
      return NextResponse.json({ error: availError.message }, { status: 500 })
    }
    
    // Group by room_type_id and get the most recent total_rooms value
    const roomTypeMap = new Map<string, number>()
    for (const record of availabilityData || []) {
      if (record.room_type_id && !roomTypeMap.has(record.room_type_id)) {
        roomTypeMap.set(record.room_type_id, record.total_rooms || 1)
      }
    }
    
    // Filter out room_type_ids that already exist
    const newRoomTypeIds = Array.from(roomTypeMap.entries()).filter(
      ([id]) => !existingIds.has(id) && !existingScidooIds.has(id)
    )
    
    if (newRoomTypeIds.length === 0) {
      // Return existing room types
      const { data: allRoomTypes } = await supabase
        .from("room_types")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("display_order", { ascending: true })
      
      return NextResponse.json({ 
        imported: 0, 
        roomTypes: allRoomTypes || [],
        message: "Nessuna nuova tipologia trovata" 
      })
    }
    
    // Get next display_order
    const maxOrder = existingRoomTypes?.length || 0
    
    // Create new room types
    const newRoomTypes = newRoomTypeIds.map(([roomTypeId, totalRooms], index) => ({
      id: uuidv4(),
      hotel_id: hotelId,
      name: `Camera ${index + maxOrder + 1}`, // Default name, user can edit later
      total_rooms: totalRooms || 1,
      capacity: 2, // Default capacity
      scidoo_room_type_id: roomTypeId, // Use the availability room_type_id
      is_active: true,
      display_order: maxOrder + index + 1,
      additional_beds: 0,
      size_sqm: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    
    const { error: insertError } = await supabase
      .from("room_types")
      .insert(newRoomTypes)
    
    if (insertError) {
      console.error("Error inserting room types:", insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    
    // Fetch all room types for this hotel
    const { data: allRoomTypes } = await supabase
      .from("room_types")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("display_order", { ascending: true })
    
    return NextResponse.json({ 
      imported: newRoomTypes.length, 
      roomTypes: allRoomTypes || [] 
    })
  } catch (error: any) {
    console.error("Error in import-from-availability:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
