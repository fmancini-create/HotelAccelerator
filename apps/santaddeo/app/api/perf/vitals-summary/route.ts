import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const sp = request.nextUrl.searchParams
    const hours = parseInt(sp.get("hours") || "24")
    const hotelId = sp.get("hotel_id")
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    let query = supabase.from("perf_web_vitals")
      .select("name, value, rating, path, created_at")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(500)
    if (hotelId) query = query.eq("hotel_id", hotelId)

    const { data: metrics, error } = await query
    if (error) throw error

    const stats: Record<string, { values: number[]; ratings: Record<string, number> }> = {}
    for (const m of metrics || []) {
      if (!stats[m.name]) stats[m.name] = { values: [], ratings: { good: 0, "needs-improvement": 0, poor: 0 } }
      stats[m.name].values.push(Number(m.value))
      if (m.rating && stats[m.name].ratings[m.rating] !== undefined) stats[m.name].ratings[m.rating]++
    }

    const summary = Object.entries(stats).map(([name, data]) => {
      const sorted = [...data.values].sort((a, b) => a - b)
      return {
        name, count: data.values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        avg: data.values.length > 0 ? Math.round(data.values.reduce((a, b) => a + b, 0) / data.values.length) : 0,
        ratings: data.ratings,
      }
    })

    return NextResponse.json({
      totalMetrics: (metrics || []).length, summary,
      recentMetrics: (metrics || []).slice(0, 20).map(m => ({
        name: m.name, value: Number(m.value), rating: m.rating, path: m.path, timestamp: m.created_at,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed", detail: String(err) }, { status: 500 })
  }
}
