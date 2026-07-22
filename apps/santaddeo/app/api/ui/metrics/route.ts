import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { type NextRequest, NextResponse } from "next/server"

// UI metrics endpoint for dashboard comparison widgets
// Security: uses cookie-based auth client (respects RLS)
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  const type = searchParams.get("type") // "comparison" | "date-selector"
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const date = searchParams.get("date")

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  if (type === "comparison" && from && to) {
    const previousFrom = searchParams.get("previousFrom")
    const previousTo = searchParams.get("previousTo")

    // Helper: fetch ALL bookings overlapping a period.
    // Uses the shared paginated helper to bypass the Supabase 1000-row cap.
    async function fetchAllBookings(periodFrom: string, periodTo: string) {
      return fetchAllPaginatedOrLog<any>(
        () =>
          supabase
            .from("bookings")
            .select("check_in_date, check_out_date, total_price, number_of_nights, price_per_night")
            .eq("hotel_id", hotelId)
            .eq("is_cancelled", false)
            .eq("is_room_booking", true)
            .lte("check_in_date", periodTo)
            .gt("check_out_date", periodFrom)
            .order("check_in_date", { ascending: true }),
        "ui-metrics-bookings",
      )
    }

    // Calculate metrics with PRORATED revenue for bookings spanning the period boundary
    function calcMetrics(bookings: any[], availData: any[], periodFrom: string, periodTo: string) {
      const pFrom = new Date(periodFrom + "T00:00:00Z")
      const pTo = new Date(periodTo + "T00:00:00Z")

      let totalRevenue = 0
      let totalRoomNights = 0

      for (const b of bookings) {
        const checkin = new Date((b.check_in_date || b.checkin_date) + "T00:00:00Z")
        const checkout = new Date((b.check_out_date || b.checkout_date) + "T00:00:00Z")
        const totalNights = Number(b.number_of_nights) ||
          Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)))
        const amount = Number(b.total_price || b.total_amount || 0)

        // Count only nights that fall within [periodFrom, periodTo]
        // A night is "in" the period if the sleep date (checkin_date of that night) is within range
        const effectiveStart = checkin > pFrom ? checkin : pFrom
        const effectiveTo = checkout < new Date(pTo.getTime() + 86400000) ? checkout : new Date(pTo.getTime() + 86400000)
        const nightsInPeriod = Math.max(0, Math.round((effectiveTo.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)))

        // Prorate revenue: (nights in period / total nights) * total_amount
        const proratedRevenue = totalNights > 0 ? (nightsInPeriod / totalNights) * amount : amount
        totalRevenue += proratedRevenue
        totalRoomNights += nightsInPeriod
      }

      const availableRooms = (availData || []).reduce((sum: number, a: any) => sum + Number(a.total_rooms || 0), 0)
      return { total_revenue: totalRevenue, room_nights: totalRoomNights, available_rooms: availableRooms }
    }

    // Helper: safely query availability table (handles missing table gracefully)
    async function safeAvailabilityQuery(periodFrom: string, periodTo: string) {
      try {
        const { data, error } = await supabase
          .from("rms_availability_daily")
          .select("date, rooms_available, total_rooms")
          .eq("hotel_id", hotelId)
          .gte("date", periodFrom)
          .lte("date", periodTo)
        if (error) {
          // Table may not exist - return empty array instead of throwing
          console.warn("[v0] rms_availability_daily query error:", error.message)
          return []
        }
        return data || []
      } catch {
        return []
      }
    }

    // Fetch all data in parallel
    const [currentBookings, previousBookings, currentAvailData, previousAvailData] = await Promise.all([
      fetchAllBookings(from, to),
      previousFrom && previousTo
        ? fetchAllBookings(previousFrom, previousTo)
        : Promise.resolve([]),
      safeAvailabilityQuery(from, to),
      previousFrom && previousTo
        ? safeAvailabilityQuery(previousFrom, previousTo)
        : Promise.resolve([]),
    ])

    const currentMetrics = calcMetrics(currentBookings, currentAvailData, from, to)
    const previousMetrics = calcMetrics(previousBookings, previousAvailData, previousFrom || from, previousTo || to)

    console.log("[v0] Metrics comparison:", JSON.stringify({
      period: { from, to },
      currentBookingsCount: currentBookings.length,
      currentRevenue: currentMetrics.total_revenue,
      currentRoomNights: currentMetrics.room_nights,
      previousBookingsCount: previousBookings.length,
      previousRevenue: previousMetrics.total_revenue,
    }))

    return NextResponse.json({
      currentData: [currentMetrics],
      previousData: [previousMetrics],
    })
  }

  if (type === "date-selector" && date) {
    // For metrics-date-selector: fetch bookings and cancellations from agnostic `bookings` table
    // Filter is_room_booking=true: service entries must not count as room bookings
    const [bookingsResult, cancellationsResult] = await Promise.all([
      supabase
        .from("bookings")
        .select("pms_booking_id, check_in_date, check_out_date, total_price, number_of_nights, booking_date, channel")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .eq("is_room_booking", true)
        .gte("booking_date", date)
        .lte("booking_date", date),
      supabase
        .from("bookings")
        .select("pms_booking_id, check_in_date, check_out_date, total_price, number_of_nights, cancellation_date, channel")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", true)
        .eq("is_room_booking", true)
        .gte("cancellation_date", date)
        .lte("cancellation_date", date),
    ])

    const bookingsData = (bookingsResult.data || []).map((b: any) => ({
      ...b,
      checkin_date: b.check_in_date,
      checkout_date: b.check_out_date,
      total_amount: Number(b.total_price || 0),
      num_nights: Number(b.number_of_nights || 1),
      scidoo_booking_id: b.pms_booking_id,
    }))

    const cancellationsData = (cancellationsResult.data || []).map((c: any) => ({
      ...c,
      checkin_date: c.check_in_date,
      checkout_date: c.check_out_date,
      lost_revenue: Number(c.total_price || 0),
      lost_room_nights: Number(c.number_of_nights || 1),
      scidoo_booking_id: c.pms_booking_id,
    }))

    return NextResponse.json({
      bookings: bookingsData,
      cancellations: cancellationsData,
    })
  }

  return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 })
}
