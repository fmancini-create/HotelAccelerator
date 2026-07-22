import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type Platform = {
  platform: string
  count: number
  avg: number | null
}

type MonthlyPoint = {
  month: string // YYYY-MM
  count: number
  avg: number | null
}

/**
 * Returns the full KPI payload for the Reviews page:
 * - totals, avg rating, reputation score 0-10, trend 30d vs 60-90d
 * - breakdown per-platform (count + avg)
 * - monthly trend of the last 12 months (for a line chart)
 * - sentiment breakdown (positive/neutral/negative)
 *
 * All heavy lifting runs in SQL. The view `reputation_scores_v` already
 * encapsulates the scoring formula, so we just read from it.
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = new URL(request.url).searchParams.get("hotelId")
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    const supabase = await createClient()

    // 1) Reputation score row (or nulls if no reviews yet)
    const { data: repRow } = await supabase
      .from("reputation_scores_v")
      .select(
        "reviews_180d, base_rating, rating_30d, rating_60_90d, base_norm, trend_bonus, volume_penalty, score"
      )
      .eq("hotel_id", hotelId)
      .maybeSingle()

    // 1b) Last sync timestamps per platform (from hotel_integrations)
    const { data: intRow } = await supabase
      .from("hotel_integrations")
      .select(
        "apify_last_sync_at, booking_com_last_sync_at, tripadvisor_last_sync_at, expedia_last_sync_at, vrbo_last_sync_at, airbnb_last_sync_at"
      )
      .eq("hotel_id", hotelId)
      .maybeSingle()

    // Pick the most recent across all platforms
    const syncTimestamps: Array<{ platform: string; at: string }> = []
    if (intRow?.apify_last_sync_at) syncTimestamps.push({ platform: "google", at: intRow.apify_last_sync_at })
    if (intRow?.booking_com_last_sync_at) syncTimestamps.push({ platform: "booking", at: intRow.booking_com_last_sync_at })
    if (intRow?.tripadvisor_last_sync_at) syncTimestamps.push({ platform: "tripadvisor", at: intRow.tripadvisor_last_sync_at })
    if (intRow?.expedia_last_sync_at) syncTimestamps.push({ platform: "expedia", at: intRow.expedia_last_sync_at })
    if (intRow?.vrbo_last_sync_at) syncTimestamps.push({ platform: "vrbo", at: intRow.vrbo_last_sync_at })
    if (intRow?.airbnb_last_sync_at) syncTimestamps.push({ platform: "airbnb", at: intRow.airbnb_last_sync_at })
    const lastSyncAt = syncTimestamps.length
      ? syncTimestamps.map((s) => s.at).sort().pop() || null
      : null

    // 2) Global aggregates (all time) + per-platform
    // BUG FIX 13/06/2026: PostgREST/Supabase cappa le risposte a 1000 righe di
    // default (`db-max-rows`). Una singola .select() senza paginazione tornava
    // SOLO le prime 1000 review (per Villa I Barronci tutte "booking"), quindi
    // il breakdown per-canale mostrava solo "booking (1000)" e total/sentiment/
    // avg/trend erano calcolati su un sottoinsieme. Paginiamo l'intero set.
    const PAGE = 1000
    const reviews: Array<{
      platform: string | null
      rating: number | null
      sentiment: string | null
      review_date: string | null
    }> = []
    for (let from = 0; ; from += PAGE) {
      const { data: pageRows, error: pageErr } = await supabase
        .from("hotel_reviews")
        .select("platform, rating, sentiment, review_date")
        .eq("hotel_id", hotelId)
        .order("review_date", { ascending: false })
        .range(from, from + PAGE - 1)
      if (pageErr) break
      const rows = pageRows || []
      reviews.push(...rows)
      if (rows.length < PAGE) break
    }

    const total = reviews.length
    const avgRating =
      total > 0
        ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / total
        : null

    // per-platform
    const byPlatform = new Map<string, { sum: number; n: number }>()
    for (const r of reviews) {
      const p = r.platform || "unknown"
      const cur = byPlatform.get(p) ?? { sum: 0, n: 0 }
      cur.sum += Number(r.rating) || 0
      cur.n += 1
      byPlatform.set(p, cur)
    }
    const platforms: Platform[] = Array.from(byPlatform.entries())
      .map(([platform, v]) => ({
        platform,
        count: v.n,
        avg: v.n > 0 ? v.sum / v.n : null,
      }))
      .sort((a, b) => b.count - a.count)

    // sentiment split
    const sentiment = {
      positive: reviews.filter((r) => r.sentiment === "positive").length,
      neutral: reviews.filter((r) => r.sentiment === "neutral").length,
      negative: reviews.filter((r) => r.sentiment === "negative").length,
    }

    // 3) Monthly trend: last 12 months, bucket by review_date
    const now = new Date()
    const monthlyMap = new Map<string, { sum: number; n: number }>()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      monthlyMap.set(key, { sum: 0, n: 0 })
    }
    for (const r of reviews) {
      if (!r.review_date) continue
      const d = new Date(r.review_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      if (monthlyMap.has(key)) {
        const cur = monthlyMap.get(key)!
        cur.sum += Number(r.rating) || 0
        cur.n += 1
      }
    }
    const monthly: MonthlyPoint[] = Array.from(monthlyMap.entries()).map(
      ([month, v]) => ({
        month,
        count: v.n,
        avg: v.n > 0 ? Number((v.sum / v.n).toFixed(2)) : null,
      })
    )

    return NextResponse.json({
      total,
      avg_rating: avgRating != null ? Number(avgRating.toFixed(2)) : null,
      reputation: repRow
        ? {
            score: repRow.score != null ? Number(Number(repRow.score).toFixed(2)) : null,
            base_norm: repRow.base_norm != null ? Number(Number(repRow.base_norm).toFixed(2)) : null,
            trend_bonus: repRow.trend_bonus != null ? Number(Number(repRow.trend_bonus).toFixed(2)) : null,
            volume_penalty: repRow.volume_penalty != null ? Number(Number(repRow.volume_penalty).toFixed(2)) : null,
            reviews_180d: repRow.reviews_180d ?? 0,
            rating_30d: repRow.rating_30d != null ? Number(Number(repRow.rating_30d).toFixed(2)) : null,
            rating_60_90d: repRow.rating_60_90d != null ? Number(Number(repRow.rating_60_90d).toFixed(2)) : null,
          }
        : null,
      platforms,
      sentiment,
      monthly,
      last_sync_at: lastSyncAt,
      last_sync_per_platform: syncTimestamps,
    })
  } catch (err) {
    console.error("[reviews/stats] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}
