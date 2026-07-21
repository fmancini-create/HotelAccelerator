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

    // Only fetch error logs (status >= 400) + total count for error rate
    let countQuery = supabase.from("perf_api_logs").select("id", { count: "exact", head: true }).gte("created_at", since)
    if (hotelId) countQuery = countQuery.eq("hotel_id", hotelId)
    const { count: totalRequests } = await countQuery

    let errQuery = supabase.from("perf_api_logs")
      .select("route, method, total_ms, status, error, created_at")
      .gte("created_at", since).gte("status", 400)
      .order("created_at", { ascending: false }).limit(500)
    if (hotelId) errQuery = errQuery.eq("hotel_id", hotelId)

    const { data: errorLogs, error } = await errQuery
    if (error) throw error

    const errors = errorLogs || []
    const errorRate = (totalRequests ?? 0) > 0 ? Math.round((errors.length / (totalRequests ?? 1)) * 10000) / 100 : 0

    // Group by route
    const byRoute = new Map<string, { count: number; statuses: Record<number, number>; lastError: string | null; lastAt: string }>()
    for (const l of errors) {
      const e = byRoute.get(l.route) || { count: 0, statuses: {}, lastError: null, lastAt: l.created_at }
      e.count++
      e.statuses[l.status] = (e.statuses[l.status] || 0) + 1
      if (!e.lastError && l.error) e.lastError = l.error
      if (l.created_at > e.lastAt) e.lastAt = l.created_at
      byRoute.set(l.route, e)
    }

    const errorAnalytics = Array.from(byRoute.entries())
      .map(([route, s]) => ({ route, ...s }))
      .sort((a, b) => b.count - a.count).slice(0, 15)

    const recentErrorLogs = errors.slice(0, 20).map(l => ({
      route: l.route, method: l.method, totalMs: Number(l.total_ms),
      status: l.status, error: l.error, timestamp: l.created_at,
    }))

    return NextResponse.json({
      totalRequests: totalRequests ?? 0, errorCount: errors.length, errorRate,
      errorAnalytics, recentErrorLogs,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed", detail: String(err) }, { status: 500 })
  }
}
