// Uses bookings.service for revenue computation
import { NextRequest, NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { cachedQuery, cacheKey, CacheTTL } from "@/lib/cache/redis"
import { getRevenue } from "@/lib/services/bookings.service"

// ⚠️ SECURITY:
// Questa route si affida a RLS di Supabase.
// NON usare service_role.
// NON aggiungere query su tabelle senza RLS.

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotel_id")
    const monthStart = searchParams.get("month_start")
    const monthEnd = searchParams.get("month_end")

    if (!hotelId || !monthStart || !monthEnd) {
      return NextResponse.json({ error: "hotel_id, month_start, and month_end required" }, { status: 400 })
    }

    // Validate user has access to this hotel
    const denied = await validateHotelAccess(hotelId, null, { allowSeller: "metrics" })
    if (denied) return denied

    const ck = cacheKey("production", hotelId, monthStart, monthEnd)
    const result = await cachedQuery(ck, CacheTTL.PRODUCTION, async () => {
      return getRevenue(hotelId, monthStart, monthEnd)
    })

    // TRACE: log what the API returns to the UI
    const today = new Date().toISOString().slice(0, 10)
    console.log("[TRACE-API-PRODUCTION] Response for", hotelId, monthStart, "->", monthEnd, "today:", today, {
      isApiMode: result.isApiMode,
      roomTypesCount: result.roomTypes?.length,
      dailyPricesKeys: Object.keys(result.dailyPrices || {}),
      todayRevenue: Object.fromEntries(
        Object.entries(result.dailyPrices || {}).map(([rt, dates]: [string, any]) => [
          rt,
          (dates as Record<string, number>)[today] ?? "NO_DATA"
        ])
      ),
      revenueByRoomType: Object.fromEntries(
        Object.entries(result.dailyPrices || {}).map(([rt, dates]: [string, any]) => [
          rt,
          Object.values(dates as Record<string, number>).reduce((s: number, v: number) => s + v, 0).toFixed(2)
        ])
      ),
    })

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
    })
  } catch (error: any) {
    console.error("[v0] dati/production error:", error?.message || error)
    return NextResponse.json({ error: "Internal server error", details: error?.message || String(error) }, { status: 500 })
  }
}
