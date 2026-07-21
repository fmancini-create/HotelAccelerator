/**
 * GET /api/v1/hotels/:hotelId/availability
 *
 * Disponibilita' giornaliera per room type.
 * Scope richiesto: availability:read
 *
 * Query params:
 *   from=YYYY-MM-DD   (default: oggi)
 *   to=YYYY-MM-DD     (default: +30 giorni)
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiOk, apiInternalError, parseDateRange } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "availability:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams

    const now = new Date()
    const defaultFrom = now.toISOString().slice(0, 10)
    const plus30 = new Date(now.getTime() + 30 * 86400000)
    const defaultTo = plus30.toISOString().slice(0, 10)
    const { from, to } = parseDateRange(searchParams)
    const dateFrom = from || defaultFrom
    const dateTo = to || defaultTo

    // Fetch room types
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, code, count")
      .eq("hotel_id", hotelId)
      .order("name")

    // Fetch availability data (se disponibile)
    const { data: availability, error } = await supabase
      .from("rms_availability_daily")
      .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date")

    if (error) {
      console.error("[v1/availability] DB error:", error.message)
      return apiInternalError("Failed to fetch availability data")
    }

    // Room type lookup
    const rtMap = new Map((roomTypes || []).map((rt) => [rt.id, rt]))

    // Raggruppa per data
    const dateMap = new Map<string, Array<{
      room_type_id: string
      room_type_name: string
      room_type_code: string
      total_rooms: number
      rooms_available: number
      rooms_out_of_service: number
      occupancy_rate: number
    }>>()

    for (const av of availability || []) {
      const rt = rtMap.get(av.room_type_id)
      if (!dateMap.has(av.date)) dateMap.set(av.date, [])
      dateMap.get(av.date)!.push({
        room_type_id: av.room_type_id,
        room_type_name: rt?.name || "Sconosciuto",
        room_type_code: rt?.code || "-",
        total_rooms: av.total_rooms,
        rooms_available: av.rooms_available,
        rooms_out_of_service: av.rooms_out_of_service || 0,
        occupancy_rate: av.total_rooms > 0
          ? Math.round(((av.total_rooms - av.rooms_available) / av.total_rooms) * 10000) / 100
          : 0,
      })
    }

    // Converti a array ordinato
    const dates = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rooms]) => ({ date, rooms }))

    return apiOk({
      period: { from: dateFrom, to: dateTo },
      room_types: (roomTypes || []).map((rt) => ({
        id: rt.id,
        name: rt.name,
        code: rt.code,
        total_count: rt.count,
      })),
      dates,
    })
  } catch (err: any) {
    console.error("[v1/availability] Unexpected:", err.message)
    return apiInternalError()
  }
}
