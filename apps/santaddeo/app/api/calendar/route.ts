import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { format, startOfMonth, endOfMonth, addDays, subDays } from "date-fns"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotelId")
    const dateStr = searchParams.get("date")

    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID required" }, { status: 400 })
    }

    const currentDate = dateStr ? new Date(dateStr) : new Date()
    const startDate = subDays(startOfMonth(currentDate), 3)
    const endDate = addDays(endOfMonth(currentDate), 3)
    const startDateStr = format(startDate, "yyyy-MM-dd")
    const endDateStr = format(endDate, "yyyy-MM-dd")

    // Use service role client to bypass RLS
    const supabase = await createClient()

    // Get active room types for this hotel directly
    const { data: roomTypes, error: roomTypesError } = await supabase
      .from("room_types")
      .select("id, name, code, scidoo_room_type_id, total_rooms, is_active, display_order")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })

    if (roomTypesError || !roomTypes || roomTypes.length === 0) {
      return NextResponse.json({
        roomTypes: [],
        availability: [],
        occupancy: [],
        minstay: [],
        hasMappings: false,
      })
    }

    const roomTypeIds = roomTypes.map((rt) => rt.id)

    // Get availability from canonical daily_availability (populated by ETL)
    const { data: availability, error: availabilityError } = await supabase
      .from("daily_availability")
      .select("date, room_type_id, rooms_available")
      .eq("hotel_id", hotelId)
      .in("room_type_id", roomTypeIds)
      .gte("date", startDateStr)
      .lte("date", endDateStr)

    if (availabilityError) {
      console.error("Calendar API - availability error:", availabilityError)
    }

    // Get occupancy from bookings table
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("room_type_id, check_in_date, check_out_date")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .in("room_type_id", roomTypeIds)
      .lte("check_in_date", endDateStr)
      .gt("check_out_date", startDateStr)

    if (bookingsError) {
      console.error("Calendar API - bookings error:", bookingsError)
    }

    // Calculate occupancy per room_type per day from bookings
    const occupancyMap = new Map<string, number>()
    
    if (bookings) {
      for (const booking of bookings) {
        if (!booking.room_type_id) continue
        
        const checkIn = new Date(booking.check_in_date)
        const checkOut = new Date(booking.check_out_date)
        
        // For each day the booking spans within our range
        let current = new Date(Math.max(checkIn.getTime(), startDate.getTime()))
        const end = new Date(Math.min(checkOut.getTime(), endDate.getTime()))
        
        while (current < end) {
          const dateKey = format(current, "yyyy-MM-dd")
          const key = `${dateKey}|${booking.room_type_id}`
          occupancyMap.set(key, (occupancyMap.get(key) || 0) + 1)
          current = addDays(current, 1)
        }
      }
    }

    // Convert occupancy map to array format expected by the calendar
    const occupancy = Array.from(occupancyMap.entries()).map(([key, rooms_sold]) => {
      const [date, room_type_id] = key.split("|")
      return { date, room_type_id, rooms_sold }
    })

    // Get minstay data - try minstay_restrictions table
    let minstayData: { date: string; room_type_id: string; min_stay: number }[] = []
    
    try {
      const { data: minstayAlt } = await supabase
        .from("minstay_restrictions")
        .select("date, room_type_id, minstay")
        .eq("hotel_id", hotelId)
        .in("room_type_id", roomTypeIds)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
      
      if (minstayAlt && minstayAlt.length > 0) {
        minstayData = minstayAlt.map(m => ({ date: m.date, room_type_id: m.room_type_id, min_stay: m.minstay }))
      }
    } catch {
      // minstay table may not exist, continue without minstay data
    }

    return NextResponse.json({
      hasMappings: true,
      roomTypes: roomTypes || [],
      availability: availability || [],
      occupancy: occupancy || [],
      minstay: minstayData || [],
    })
  } catch (error) {
    console.error("Calendar API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
