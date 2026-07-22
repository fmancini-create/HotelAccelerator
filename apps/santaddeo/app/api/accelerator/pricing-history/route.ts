import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotel_id")
    const roomTypeId = searchParams.get("room_type_id")
    const rateId = searchParams.get("rate_id")
    const occupancy = searchParams.get("occupancy")
    const date = searchParams.get("date")

    // Validate required parameters
    if (!hotelId || !roomTypeId || !rateId || !occupancy || !date) {
      return NextResponse.json(
        { error: "Missing required parameters: hotel_id, room_type_id, rate_id, occupancy, date" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Fetch price change history for this specific cell with user names
    const { data, error } = await supabase
      .from("price_change_log")
      .select("changed_at, old_price, new_price, source, action_taken, changed_by, auth_users(user_metadata->full_name)")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("rate_id", rateId)
      .eq("occupancy", parseInt(occupancy))
      .eq("target_date", date)
      .order("changed_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const history = data || []
    
    // If no history in price_change_log, fallback to pricing_grid current price
    // This handles prices that were set before the logging trigger existed
    if (history.length === 0) {
      const { data: gridRow } = await supabase
        .from("pricing_grid")
        .select("price, created_at, first_set_at, updated_at")
        .eq("hotel_id", hotelId)
        .eq("room_type_id", roomTypeId)
        .eq("rate_id", rateId)
        .eq("occupancy", parseInt(occupancy))
        .eq("date", date)
        .maybeSingle()

      if (gridRow && gridRow.price != null) {
        const setAt = gridRow.first_set_at || gridRow.created_at
        return NextResponse.json({
          priceHistory: [{
            id: "initial",
            old_price: null,
            new_price: gridRow.price,
            changed_at: setAt,
            source: "initial",
            changed_by: null,
          }],
          priceEvolutionSeries: [{ timestamp: setAt, price: gridRow.price }],
          startingPrice: gridRow.price,
          currentPrice: gridRow.price,
          currentRoomsSold: null,
          totalRooms: null,
          lastUpdated: setAt,
          cell: { hotel_id: hotelId, room_type_id: roomTypeId, rate_id: rateId, occupancy: parseInt(occupancy), date },
        })
      }

      // No price at all
      return NextResponse.json({
        priceHistory: [],
        priceEvolutionSeries: [],
        startingPrice: null,
        currentPrice: null,
        currentRoomsSold: null,
        totalRooms: null,
        lastUpdated: null,
        cell: { hotel_id: hotelId, room_type_id: roomTypeId, rate_id: rateId, occupancy: parseInt(occupancy), date },
      })
    }

    // Build priceEvolutionSeries from history for sparkline chart
    // Also normalize the user name from nested auth_users join
    const priceEvolutionSeries = history.map((h: any) => ({
      timestamp: h.changed_at,
      price: h.new_price,
    }))

    // Normalize history to include user_name from the join
    const normalizedHistory = history.map((h: any) => ({
      ...h,
      user_name: h.auth_users?.user_metadata?.full_name || h.changed_by,
    }))

    // Calculate starting and current prices
    const startingPrice = history[0].old_price ?? history[0].new_price
    const currentPrice = history[history.length - 1].new_price

    return NextResponse.json({
      priceHistory: normalizedHistory,
      priceEvolutionSeries,
      startingPrice,
      currentPrice,
      currentRoomsSold: null,
      totalRooms: null,
      lastUpdated: history[history.length - 1].changed_at,
      cell: { hotel_id: hotelId, room_type_id: roomTypeId, rate_id: rateId, occupancy: parseInt(occupancy), date },
    })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
