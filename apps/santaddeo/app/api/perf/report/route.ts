/**
 * Performance Report API
 * Returns aggregated performance metrics from Supabase
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { calculatePercentile } from "@/lib/performance/perf-logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const hours = parseInt(searchParams.get("hours") || "24")

    const hotelId = searchParams.get("hotel_id")
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    // Retention is handled by /api/cron/perf-cleanup (daily at 04:00 UTC)

    // Fetch API logs (with optional tenant filter)
    let query = supabase
      .from("perf_api_logs")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000)
    if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    }
    const { data: logs, error } = await query

    if (error) throw error

    const apiLogs = logs || []

    if (apiLogs.length === 0) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        hours,
        summary: {
          totalRequests: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          avgDbTime: 0,
          avgNonDbTime: 0,
          coldStartCount: 0,
          errorCount: 0,
        },
        slowestEndpoints: [],
        verdict: "FAST",
        recentLogs: [],
      })
    }

    const totalTimes = apiLogs.map((l) => Number(l.total_ms))
    const dbTimes = apiLogs.map((l) => Number(l.db_ms))
    const nonDbTimes = apiLogs.map((l) => Number(l.non_db_ms))

    // Group by route for slowest endpoints
    const routeStats = new Map<string, { total: number; count: number }>()
    for (const log of apiLogs) {
      const existing = routeStats.get(log.route) || { total: 0, count: 0 }
      existing.total += Number(log.total_ms)
      existing.count++
      routeStats.set(log.route, existing)
    }

    const slowestEndpoints = Array.from(routeStats.entries())
      .map(([route, stats]) => ({
        route,
        avgMs: Math.round(stats.total / stats.count),
        count: stats.count,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 10)

    const p50 = calculatePercentile(totalTimes, 50)
    const p95 = calculatePercentile(totalTimes, 95)
    const p99 = calculatePercentile(totalTimes, 99)

    let verdict: "FAST" | "ACCEPTABLE" | "SLOW" = "FAST"
    if (p95 > 3000) verdict = "SLOW"
    else if (p95 > 1000) verdict = "ACCEPTABLE"

    // Error analytics: group errors by route + status
    const errorLogs = apiLogs.filter((l) => l.status >= 400)
    const errorsByRoute = new Map<string, { count: number; statuses: Record<number, number>; lastError: string | null; lastAt: string }>()
    for (const log of errorLogs) {
      const key = log.route
      const existing = errorsByRoute.get(key) || { count: 0, statuses: {}, lastError: null, lastAt: log.created_at }
      existing.count++
      existing.statuses[log.status] = (existing.statuses[log.status] || 0) + 1
      if (!existing.lastError && log.error) existing.lastError = log.error
      if (log.created_at > existing.lastAt) existing.lastAt = log.created_at
      errorsByRoute.set(key, existing)
    }
    const errorAnalytics = Array.from(errorsByRoute.entries())
      .map(([route, stats]) => ({ route, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)

    const errorRate = apiLogs.length > 0 ? Math.round((errorLogs.length / apiLogs.length) * 10000) / 100 : 0

    // Map logs to the format the dashboard expects
    const recentLogs = apiLogs.slice(0, 50).map((l) => ({
      route: l.route,
      method: l.method,
      totalMs: Number(l.total_ms),
      dbMs: Number(l.db_ms),
      nonDbMs: Number(l.non_db_ms),
      coldStart: l.cold_start,
      hotelId: l.hotel_id,
      status: l.status,
      error: l.error,
      timestamp: l.created_at,
    }))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      hours,
      summary: {
        totalRequests: apiLogs.length,
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        avgDbTime: Math.round(dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length),
        avgNonDbTime: Math.round(nonDbTimes.reduce((a, b) => a + b, 0) / nonDbTimes.length),
        coldStartCount: apiLogs.filter((l) => l.cold_start).length,
        errorCount: apiLogs.filter((l) => l.status >= 400).length,
      },
      slowestEndpoints,
      verdict,
      recentLogs,
      errorAnalytics,
      errorRate,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to generate report", detail: String(err) }, { status: 500 })
  }
}
