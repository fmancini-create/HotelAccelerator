// Security: uses cookie-based auth client (respects RLS)
import { NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"
export const revalidate = 0

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/dashboard/availability", handleGET)

async function handleGET(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id")
  const date = searchParams.get("date")

  if (!hotelId || !date) return NextResponse.json({ error: "hotel_id and date required" }, { status: 400 })

  try {
    // Fetch active room_type IDs to filter out inactive types (e.g. closed apartments)
    const { data: activeRoomTypes } = await supabase
      .from("room_types")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
    const activeIds = new Set((activeRoomTypes || []).map((rt: any) => rt.id))

    // Fetch real total_rooms from room_types (Scidoo reduces total_rooms in availability when rooms are OOS)
    const { data: roomTypesAll } = await supabase
      .from("room_types")
      .select("id,total_rooms")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
    const realTotalMap: Record<string, number> = {}
    for (const rt of roomTypesAll || []) {
      realTotalMap[rt.id] = rt.total_rooms || 0
    }

    // Primary: rms_availability_daily (populated by Scidoo ETL)
    const { data: rmsData } = await supabase
      .from("rms_availability_daily")
      .select("rooms_available,room_type_id,total_rooms,rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .eq("date", date)

    if (rmsData && rmsData.length > 0) {
      const activeRmsData = rmsData.filter((r: any) => activeIds.has(r.room_type_id))
      const enrichedData = activeRmsData.map((r: any) => {
        const scidooTotal = r.total_rooms || 0
        const realTotal = realTotalMap[r.room_type_id] || scidooTotal
        // FIX 21/07/2026 (dashboard non mostrava le camere in manutenzione): prima
        // l'OOS veniva SEMPRE ricalcolato come realTotal - scidooTotal, assumendo
        // che Scidoo riducesse total_rooms per le camere fuori servizio. Oggi non
        // e' piu' cosi': l'ETL salva total_rooms PIENO + una colonna esplicita
        // rooms_out_of_service (derivata dall'invariante total-available-occupied,
        // vedi fix scidoo-mapper). Quindi realTotal==scidooTotal -> la vecchia
        // formula dava 0 e la manutenzione spariva (es. Barronci 03/07: 2 camere
        // in manutenzione mostrate come 0). Ora usiamo la colonna reale, con la
        // derivazione legacy solo come fallback per le righe storiche dove Scidoo
        // aveva effettivamente ridotto total_rooms (scidooTotal < realTotal).
        const storedOos = Math.max(0, r.rooms_out_of_service || 0)
        const legacyGapOos = Math.max(0, realTotal - scidooTotal)
        const oos = Math.max(storedOos, legacyGapOos)
        return { ...r, total_rooms: realTotal, rooms_out_of_service: oos }
      })
      return NextResponse.json({ source: "rms_availability_daily", data: enrichedData, count: enrichedData.length })
    }

    // Fallback 1: daily_availability (GSheets sync)
    const { data: dailyData } = await supabase
      .from("daily_availability")
      .select("rooms_available,room_type_id,total_rooms,rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .eq("date", date)

    if (dailyData && dailyData.length > 0) {
      const activeDailyData = dailyData.filter((r: any) => activeIds.has(r.room_type_id))
      const enrichedData = activeDailyData.map((r: any) => {
        const scidooTotal = r.total_rooms || 0
        const realTotal = realTotalMap[r.room_type_id] || scidooTotal
        // FIX 21/07/2026: stessa logica del ramo rms_availability_daily sopra -
        // usa la colonna reale rooms_out_of_service, derivazione legacy solo come
        // fallback per righe storiche con total_rooms ridotto da Scidoo.
        const storedOos = Math.max(0, r.rooms_out_of_service || 0)
        const legacyGapOos = Math.max(0, realTotal - scidooTotal)
        const oos = Math.max(storedOos, legacyGapOos)
        return { ...r, total_rooms: realTotal, rooms_out_of_service: oos }
      })
      return NextResponse.json({ source: "daily_availability", data: enrichedData, count: enrichedData.length })
    }

    // Fallback 2: compute from bookings + room_types
    const [roomTypesResult, occupiedResult] = await Promise.all([
      supabase
        .from("room_types")
        .select("id,name,total_rooms")
        .eq("hotel_id", hotelId)
        .eq("is_active", true),
      supabase
        .from("bookings")
        .select("room_type_id")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .eq("is_room_booking", true)
        .lte("check_in_date", date)
        .gt("check_out_date", date),
    ])

    const roomTypes = roomTypesResult.data || []
    const occupied = occupiedResult.data || []

    if (roomTypes.length > 0) {
      const occupiedMap: Record<string, number> = {}
      for (const b of occupied) {
        if (b.room_type_id) occupiedMap[b.room_type_id] = (occupiedMap[b.room_type_id] || 0) + 1
      }
      const computed = roomTypes.map((rt: any) => ({
        room_type_id: rt.id,
        total_rooms: rt.total_rooms || 1,
        rooms_available: Math.max(0, (rt.total_rooms || 1) - (occupiedMap[rt.id] || 0)),
        rooms_out_of_service: 0,
      }))
      return NextResponse.json({ source: "computed_from_bookings", data: computed, count: computed.length })
    }

    return NextResponse.json({ source: "none", data: [], count: 0 })
  } catch (error: any) {
    console.error("[availability] error:", error?.message || error)
    return NextResponse.json({ source: "error", error: error.message, data: [], count: 0 })
  }
}
