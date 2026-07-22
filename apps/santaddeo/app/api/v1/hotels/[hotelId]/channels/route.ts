/**
 * GET /api/v1/hotels/:hotelId/channels
 *
 * Breakdown prenotazioni per canale di vendita.
 * Scope richiesto: channels:read
 *
 * Query params:
 *   from=YYYY-MM-DD   (filtro check_in >= from, default: inizio anno)
 *   to=YYYY-MM-DD     (filtro check_in <= to, default: oggi)
 */

import { type NextRequest } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiOk, apiInternalError, parseDateRange } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "channels:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams

    const now = new Date()
    const defaultFrom = `${now.getFullYear()}-01-01`
    const defaultTo = now.toISOString().slice(0, 10)
    const { from, to } = parseDateRange(searchParams)
    const dateFrom = from || defaultFrom
    const dateTo = to || defaultTo

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("channel, total_price, number_of_nights, is_cancelled")
      .eq("hotel_id", hotelId)
      .gte("check_in_date", dateFrom)
      .lte("check_in_date", dateTo)

    if (error) {
      console.error("[v1/channels] DB error:", error.message)
      return apiInternalError("Failed to fetch channel data")
    }

    // Aggregazione per canale
    const channelMap = new Map<string, {
      channel: string
      bookings_total: number
      bookings_active: number
      bookings_cancelled: number
      revenue: number
      room_nights: number
    }>()

    for (const b of bookings || []) {
      const ch = b.channel || "Diretto"
      const existing = channelMap.get(ch)
      const price = b.is_cancelled ? 0 : (Number(b.total_price) || 0)
      const nights = b.is_cancelled ? 0 : (b.number_of_nights || 1)

      if (existing) {
        existing.bookings_total++
        if (b.is_cancelled) existing.bookings_cancelled++
        else existing.bookings_active++
        existing.revenue += price
        existing.room_nights += nights
      } else {
        channelMap.set(ch, {
          channel: ch,
          bookings_total: 1,
          bookings_active: b.is_cancelled ? 0 : 1,
          bookings_cancelled: b.is_cancelled ? 1 : 0,
          revenue: price,
          room_nights: nights,
        })
      }
    }

    const totalRevenue = Array.from(channelMap.values()).reduce((s, c) => s + c.revenue, 0)

    const channels = Array.from(channelMap.values())
      .map((c) => ({
        ...c,
        revenue: Math.round(c.revenue * 100) / 100,
        adr: c.room_nights > 0 ? Math.round((c.revenue / c.room_nights) * 100) / 100 : 0,
        revenue_share: totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 10000) / 100 : 0,
        cancellation_rate: c.bookings_total > 0 ? Math.round((c.bookings_cancelled / c.bookings_total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    return apiOk({
      period: { from: dateFrom, to: dateTo },
      summary: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_bookings: (bookings || []).length,
        channels_count: channels.length,
      },
      channels,
    })
  } catch (err: any) {
    console.error("[v1/channels] Unexpected:", err.message)
    return apiInternalError()
  }
}
