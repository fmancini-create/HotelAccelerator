import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

export const dynamic = "force-dynamic"

// GET: Fetch room types for a hotel
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId is required" }, { status: 400 })
    }
    
    const { data: roomTypes, error } = await supabase
      .from("room_types")
      .select("id, name, total_rooms, capacity, min_occupancy, max_occupancy, is_active, display_order, scidoo_room_type_id, pms_room_type_id")
      .eq("hotel_id", hotelId)
      .order("display_order", { ascending: true })
    
    if (error) {
      console.error("Error fetching room types:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ roomTypes: roomTypes || [] })
  } catch (error: any) {
    console.error("Error in room-types GET:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Create a new room type manually (for GSheets mode)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { hotelId, name, total_rooms, capacity, min_occupancy, max_occupancy } = body
    
    if (!hotelId || !name) {
      return NextResponse.json({ error: "hotelId and name are required" }, { status: 400 })
    }
    
    // Get the next display_order
    const { data: existingRoomTypes } = await supabase
      .from("room_types")
      .select("display_order")
      .eq("hotel_id", hotelId)
      .order("display_order", { ascending: false })
      .limit(1)
    
    const nextOrder = (existingRoomTypes?.[0]?.display_order || 0) + 1
    
    // Create a scidoo_room_type_id based on UUID (for GSheets compatibility)
    const scidooRoomTypeId = `gsheets_${uuidv4().split("-")[0]}`
    
    const newRoomType = {
      id: uuidv4(),
      hotel_id: hotelId,
      name: name.trim(),
      total_rooms: total_rooms || 1,
      capacity: capacity || 2,
      min_occupancy: min_occupancy || 1,
      max_occupancy: max_occupancy || capacity || 2,
      scidoo_room_type_id: scidooRoomTypeId,
      is_active: true,
      display_order: nextOrder,
      additional_beds: 0,
      size_sqm: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { data, error } = await supabase
      .from("room_types")
      .insert(newRoomType)
      .select()
      .single()
    
    if (error) {
      console.error("Error creating room type:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ roomType: data })
  } catch (error: any) {
    console.error("Error in room-types POST:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
