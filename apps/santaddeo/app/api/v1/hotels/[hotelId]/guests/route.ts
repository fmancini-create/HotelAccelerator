/**
 * GET /api/v1/hotels/:hotelId/guests
 *
 * Lista ospiti unici con aggregazioni (visite, revenue totale, ultimo soggiorno).
 * Scope richiesto: guests:read
 *
 * Query params:
 *   page=1
 *   per_page=50
 *   search=nome     (ricerca per nome ospite)
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiList, apiInternalError, parsePagination } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "guests:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams
    const { page, perPage, offset } = parsePagination(searchParams)
    const search = searchParams.get("search") || null

    // Aggregazione ospiti dalle prenotazioni confermate
    // Raggruppiamo per guest_name (dedup base -- in futuro si puo' migliorare con fuzzy matching)
    let query = supabase
      .from("bookings")
      .select("guest_name, channel, check_in_date, check_out_date, total_price, number_of_nights")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .not("guest_name", "is", null)

    if (search) {
      query = query.ilike("guest_name", `%${search}%`)
    }

    const { data: bookings, error } = await query.order("check_in_date", { ascending: false })

    if (error) {
      console.error("[v1/guests] DB error:", error.message)
      return apiInternalError("Failed to fetch guest data")
    }

    // Aggregazione client-side per nome ospite
    const guestMap = new Map<string, {
      name: string
      visits: number
      total_revenue: number
      total_nights: number
      channels: Set<string>
      first_visit: string
      last_visit: string
    }>()

    for (const b of bookings || []) {
      const name = (b.guest_name || "").trim()
      if (!name || name.startsWith("Prenotazione ")) continue

      const existing = guestMap.get(name)
      const price = Number(b.total_price) || 0
      const nights = b.number_of_nights || 1

      if (existing) {
        existing.visits++
        existing.total_revenue += price
        existing.total_nights += nights
        if (b.channel) existing.channels.add(b.channel)
        if (b.check_in_date < existing.first_visit) existing.first_visit = b.check_in_date
        if (b.check_in_date > existing.last_visit) existing.last_visit = b.check_in_date
      } else {
        guestMap.set(name, {
          name,
          visits: 1,
          total_revenue: price,
          total_nights: nights,
          channels: new Set(b.channel ? [b.channel] : []),
          first_visit: b.check_in_date,
          last_visit: b.check_in_date,
        })
      }
    }

    // Converti a array ordinato per revenue desc
    const guests = Array.from(guestMap.values())
      .map((g) => ({
        name: g.name,
        visits: g.visits,
        total_revenue: Math.round(g.total_revenue * 100) / 100,
        total_nights: g.total_nights,
        avg_revenue_per_night: g.total_nights > 0 ? Math.round((g.total_revenue / g.total_nights) * 100) / 100 : 0,
        channels: Array.from(g.channels),
        first_visit: g.first_visit,
        last_visit: g.last_visit,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)

    const total = guests.length
    const paginated = guests.slice(offset, offset + perPage)

    return apiList(paginated, { total, page, per_page: perPage })
  } catch (err: any) {
    console.error("[v1/guests] Unexpected:", err.message)
    return apiInternalError()
  }
}
