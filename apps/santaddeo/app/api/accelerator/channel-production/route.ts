// Channel Production API — uses pricing.service for grid computation
import { NextRequest, NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { cachedQuery, cacheKey, CacheTTL } from "@/lib/cache/redis"
import { getPricingGrid } from "@/lib/services/pricing.service"

// ⚠️ SECURITY:
// Questa route si affida a RLS di Supabase.
// NON usare service_role.
// NON aggiungere query su tabelle senza RLS.

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    const monthStr = searchParams.get("month")

    if (!hotelId) {
      return NextResponse.json({ error: "Missing hotelId" }, { status: 400 })
    }

    // Validate user has access to this hotel
    const denied = await validateHotelAccess(hotelId, null, { allowSeller: "full" })
    if (denied) return denied

    const month = monthStr ? new Date(monthStr) : new Date()
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().split("T")[0]
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0).toISOString().split("T")[0]

    // Previous year date range (same month, year-1)
    const prevYear = month.getFullYear() - 1
    const prevMonthStart = new Date(prevYear, month.getMonth(), 1).toISOString().split("T")[0]
    const prevMonthEnd = new Date(prevYear, month.getMonth() + 1, 0).toISOString().split("T")[0]

    const ck = cacheKey("channel-production", hotelId, monthStart)
    const result = await cachedQuery(ck, CacheTTL.CHANNEL_PRODUCTION, async () => {
      return getPricingGrid(hotelId, monthStart, monthEnd, prevMonthStart, prevMonthEnd)
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] channel-production error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
