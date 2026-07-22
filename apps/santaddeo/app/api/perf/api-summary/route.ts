import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { calculatePercentile } from "@/lib/performance/perf-logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const sp = request.nextUrl.searchParams
    const hours = parseInt(sp.get("hours") || "24")
    const hotelId = sp.get("hotel_id")
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from("perf_api_logs")
      .select("route, method, total_ms, db_ms, non_db_ms, cold_start, hotel_id, status, error, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000)
    if (hotelId) query = query.eq("hotel_id", hotelId)

    const { data: logs, error } = await query
    if (error) throw error
    const apiLogs = logs || []

    if (apiLogs.length === 0) {
      return NextResponse.json({
        summary: { totalRequests: 0, p50: 0, p95: 0, p99: 0, avgDbTime: 0, avgNonDbTime: 0, coldStartCount: 0, errorCount: 0 },
        slowestEndpoints: [],
        verdict: "FAST" as const,
        recentLogs: [],
      })
    }

    const totalTimes = apiLogs.map(l => Number(l.total_ms))
    const dbTimes = apiLogs.map(l => Number(l.db_ms))
    const nonDbTimes = apiLogs.map(l => Number(l.non_db_ms))

    const routeStats = new Map<string, { total: number; count: number }>()
    for (const log of apiLogs) {
      const e = routeStats.get(log.route) || { total: 0, count: 0 }
      e.total += Number(log.total_ms); e.count++
      routeStats.set(log.route, e)
    }

    const slowestEndpoints = Array.from(routeStats.entries())
      .map(([route, s]) => ({ route, avgMs: Math.round(s.total / s.count), count: s.count }))
      .sort((a, b) => b.avgMs - a.avgMs).slice(0, 10)

    const p50 = calculatePercentile(totalTimes, 50)
    const p95 = calculatePercentile(totalTimes, 95)
    const p99 = calculatePercentile(totalTimes, 99)
    let verdict: "FAST" | "ACCEPTABLE" | "SLOW" = p95 > 3000 ? "SLOW" : p95 > 1000 ? "ACCEPTABLE" : "FAST"

    const recentLogs = apiLogs.slice(0, 50).map(l => ({
      route: l.route, method: l.method, totalMs: Number(l.total_ms), dbMs: Number(l.db_ms),
      nonDbMs: Number(l.non_db_ms), coldStart: l.cold_start, hotelId: l.hotel_id,
      status: l.status, error: l.error, timestamp: l.created_at,
    }))

    return NextResponse.json({
      summary: {
        totalRequests: apiLogs.length,
        p50: Math.round(p50), p95: Math.round(p95), p99: Math.round(p99),
        avgDbTime: Math.round(dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length),
        avgNonDbTime: Math.round(nonDbTimes.reduce((a, b) => a + b, 0) / nonDbTimes.length),
        coldStartCount: apiLogs.filter(l => l.cold_start).length,
        errorCount: apiLogs.filter(l => l.status >= 400).length,
      },
      slowestEndpoints, verdict, recentLogs,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed", detail: String(err) }, { status: 500 })
  }
}
