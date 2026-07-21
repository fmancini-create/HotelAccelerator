import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Aggregates real bookings from our DB (last 90 days) and joins them with the
 * latest OTA KPI snapshots manually inserted by the user, to produce the
 * payload consumed by /dati/performance-ota.
 *
 * Shape exactly matches what the client components expect:
 *   - snapshots          : Array<kpi snapshot>, newest first
 *   - channelMix         : { totalBookings, totalRevenue, bookingComShare, channels[] }
 *   - suggestedWeights   : { bookingShare, suggestions[] } | null
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 90-day window for channel mix (matches UI description).
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 90)
  const sinceIso = since.toISOString().slice(0, 10)

  const [bookingsRes, snapshotsRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, channel, source, total_price, is_cancelled, created_at")
      .eq("hotel_id", hotelId)
      .gte("created_at", sinceIso),
    supabase
      .from("hotel_ota_kpi_snapshots")
      .select(
        "id, period_start, period_end, search_views, property_views, bookings_count, prev_search_views, prev_property_views, prev_bookings_count, ranking_score, ranking_position, total_competitors, notes",
      )
      .eq("hotel_id", hotelId)
      .eq("platform", "booking_com")
      .order("period_end", { ascending: false })
      .limit(12),
  ])

  if (bookingsRes.error) {
    return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 })
  }

  const bookings = bookingsRes.data ?? []
  const snapshots = snapshotsRes.data ?? []

  // Channel mix
  const channelAgg = new Map<string, { bookings: number; revenue: number }>()
  let totalBookings = 0
  let totalRevenue = 0

  for (const b of bookings) {
    if (b.is_cancelled) continue
    const key = normalizeChannel(b.channel ?? b.source ?? null)
    const revenue = Number(b.total_price ?? 0)
    const cur = channelAgg.get(key) ?? { bookings: 0, revenue: 0 }
    cur.bookings += 1
    cur.revenue += revenue
    channelAgg.set(key, cur)
    totalBookings += 1
    totalRevenue += revenue
  }

  const channels = Array.from(channelAgg.entries())
    .map(([channel, v]) => ({
      channel,
      bookings: v.bookings,
      revenue: Math.round(v.revenue * 100) / 100,
      revenueShare: totalRevenue > 0 ? v.revenue / totalRevenue : 0,
    }))
    .sort((a, b) => b.revenueShare - a.revenueShare)

  const bookingCom = channels.find((c) => c.channel === "booking_com")
  const bookingComShare = bookingCom?.revenueShare ?? 0

  const channelMix = {
    totalBookings,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    bookingComShare,
    channels,
  }

  // Suggested K weights (derived from real Booking revenue share + existing
  // default weights on `pricing_variables`). We ONLY suggest weights for
  // variables that already exist; we don't auto-create new K variables here.
  let suggestedWeights: unknown = null

  if (bookingCom && snapshots.length > 0) {
    const keys = ["k_booking_visibility", "k_booking_conversion", "k_channel_mix"]
    const { data: pvars } = await supabase
      .from("pricing_variables")
      .select("variable_key, label, default_weight")
      .in("variable_key", keys)

    if (pvars && pvars.length > 0) {
      const weight = shareToWeight(bookingComShare)
      suggestedWeights = {
        bookingShare: bookingComShare,
        suggestions: pvars.map((v) => ({
          variable_key: v.variable_key,
          variable_label: v.label,
          current_weight: v.default_weight,
          suggested_weight: weight,
          rationale: `Booking pesa il ${(bookingComShare * 100).toFixed(1)}% del tuo fatturato reale`,
        })),
      }
    }
  }

  return NextResponse.json({
    snapshots,
    channelMix,
    suggestedWeights,
  })
}

function normalizeChannel(raw: string | null): string {
  if (!raw) return "direct"
  const s = raw.toLowerCase().trim()
  if (s.includes("booking") || s === "bcom") return "booking_com"
  if (s.includes("airbnb")) return "airbnb"
  if (s.includes("expedia")) return "expedia"
  if (s.includes("direct") || s.includes("diretto") || s.includes("website") || s.includes("site"))
    return "direct"
  return s
}

/**
 * Piecewise mapping of Booking revenue share to a suggested 0..10 weight.
 * The more Booking actually contributes to revenue, the more the related
 * K-variables should influence the price.
 */
function shareToWeight(share: number): number {
  if (share < 0.05) return 1
  if (share < 0.15) return 3
  if (share < 0.3) return 5
  if (share < 0.5) return 7
  if (share < 0.7) return 9
  return 10
}
