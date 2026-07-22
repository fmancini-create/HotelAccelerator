/**
 * GET /api/v1/hotels/:hotelId/bookings
 *
 * Lista prenotazioni con filtri e paginazione.
 * Scope richiesto: bookings:read
 *
 * Query params:
 *   from=YYYY-MM-DD       (filtro check_in >= from)
 *   to=YYYY-MM-DD         (filtro check_in <= to)
 *   status=active|cancelled|all  (default: all)
 *   channel=Booking.com   (filtro per canale)
 *   page=1
 *   per_page=50
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiList, apiInternalError, parsePagination, parseDateRange } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "bookings:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams

    const { from, to } = parseDateRange(searchParams)
    const status = searchParams.get("status") || "all"
    const channel = searchParams.get("channel") || null
    const { page, perPage, offset } = parsePagination(searchParams)

    // Build query
    let countQuery = supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)

    let dataQuery = supabase
      .from("bookings")
      .select("id, pms_booking_id, pms_reservation_number, guest_name, channel, source, check_in_date, check_out_date, number_of_nights, total_price, is_cancelled, cancellation_date, booking_date, created_at")
      .eq("hotel_id", hotelId)

    // Filtri opzionali
    if (from) {
      countQuery = countQuery.gte("check_in_date", from)
      dataQuery = dataQuery.gte("check_in_date", from)
    }
    if (to) {
      countQuery = countQuery.lte("check_in_date", to)
      dataQuery = dataQuery.lte("check_in_date", to)
    }
    if (status === "active") {
      countQuery = countQuery.eq("is_cancelled", false)
      dataQuery = dataQuery.eq("is_cancelled", false)
    } else if (status === "cancelled") {
      countQuery = countQuery.eq("is_cancelled", true)
      dataQuery = dataQuery.eq("is_cancelled", true)
    }
    if (channel) {
      countQuery = countQuery.ilike("channel", `%${channel}%`)
      dataQuery = dataQuery.ilike("channel", `%${channel}%`)
    }

    const { count } = await countQuery
    const { data, error } = await dataQuery
      .order("check_in_date", { ascending: false })
      .range(offset, offset + perPage - 1)

    if (error) {
      console.error("[v1/bookings] DB error:", error.message)
      return apiInternalError("Failed to fetch bookings")
    }

    return apiList(data || [], { total: count || 0, page, per_page: perPage })
  } catch (err: any) {
    console.error("[v1/bookings] Unexpected:", err.message)
    return apiInternalError()
  }
}
