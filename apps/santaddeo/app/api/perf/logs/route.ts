/**
 * Performance Logs API
 * Returns raw performance logs with filtering from Supabase
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const route = searchParams.get("route")
    const minMs = searchParams.get("minMs")
    const onlySlow = searchParams.get("onlySlow") === "true"
    const onlyCold = searchParams.get("onlyCold") === "true"
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200)
    const hours = parseInt(searchParams.get("hours") || "24")
    const cursor = searchParams.get("cursor") // ISO timestamp for cursor-based pagination
    const hotelId = searchParams.get("hotel_id")

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from("perf_api_logs")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit + 1) // fetch one extra to know if there's a next page

    if (cursor) query = query.lt("created_at", cursor)
    if (hotelId) query = query.eq("hotel_id", hotelId)

    if (route) {
      query = query.ilike("route", `%${route}%`)
    }
    if (minMs) {
      query = query.gte("total_ms", parseInt(minMs))
    }
    if (onlySlow) {
      query = query.gte("total_ms", 1000)
    }
    if (onlyCold) {
      query = query.eq("cold_start", true)
    }

    const { data: logs, error } = await query

    if (error) throw error

    const allLogs = logs || []
    const hasMore = allLogs.length > limit
    const pageLogs = hasMore ? allLogs.slice(0, limit) : allLogs

    const mapped = pageLogs.map((l) => ({
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

    const nextCursor = hasMore && pageLogs.length > 0 ? pageLogs[pageLogs.length - 1].created_at : null

    return NextResponse.json({
      count: mapped.length,
      logs: mapped,
      nextCursor,
      hasMore,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch logs", detail: String(err) }, { status: 500 })
  }
}
