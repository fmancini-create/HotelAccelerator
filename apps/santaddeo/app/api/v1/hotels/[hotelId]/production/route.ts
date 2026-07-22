/**
 * GET /api/v1/hotels/:hotelId/production
 *
 * Dati di produzione giornaliera (revenue, ADR, RevPAR, occupancy).
 * Scope richiesto: production:read
 *
 * Query params:
 *   from=YYYY-MM-DD  (default: primo giorno mese corrente)
 *   to=YYYY-MM-DD    (default: oggi)
 *   page=1           (paginazione)
 *   per_page=50      (max 100)
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiList, apiInternalError, parsePagination, parseDateRange } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "production:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams

    // Default: primo giorno mese corrente -> oggi
    const now = new Date()
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    const defaultTo = now.toISOString().slice(0, 10)

    const { from, to } = parseDateRange(searchParams)
    const dateFrom = from || defaultFrom
    const dateTo = to || defaultTo
    const { page, perPage, offset } = parsePagination(searchParams)

    // Count totale
    const { count } = await supabase
      .from("daily_production")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)

    // Dati paginati
    const { data, error } = await supabase
      .from("daily_production")
      .select("date, total_revenue, rooms_occupied, total_rooms, adr, revpar, occupancy_rate, source")
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true })
      .range(offset, offset + perPage - 1)

    if (error) {
      console.error("[v1/production] DB error:", error.message)
      return apiInternalError("Failed to fetch production data")
    }

    return apiList(data || [], { total: count || 0, page, per_page: perPage })
  } catch (err: any) {
    console.error("[v1/production] Unexpected:", err.message)
    return apiInternalError()
  }
}
