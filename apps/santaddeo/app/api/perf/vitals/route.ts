/**
 * Web Vitals Collection Endpoint
 * Receives frontend performance metrics and persists to Supabase
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    // Support both Content-Type: application/json and text/plain (sendBeacon)
    const text = await request.text()
    const body = JSON.parse(text)

    const supabase = await createClient()

    // Batch mode: { batch: [...metrics] }
    if (body.batch && Array.isArray(body.batch)) {
      const rows = body.batch
        .filter((m: any) => m.name && m.value != null)
        .map((m: any) => ({
          name: m.name,
          value: m.value,
          rating: m.rating || null,
          path: m.path || null,
          session_id: m.session_id || null,
          sampled: m.sampled ?? true,
        }))
      if (rows.length > 0) {
        await supabase.from("perf_web_vitals").insert(rows)
      }
      return NextResponse.json({ success: true, count: rows.length })
    }

    // Single metric mode (backward compatible)
    const { name, value, rating, path, session_id, sampled } = body

    if (!name || value == null) {
      return NextResponse.json({ error: "Invalid metric" }, { status: 400 })
    }

    await supabase.from("perf_web_vitals").insert({
      name,
      value,
      rating: rating || null,
      path: path || null,
      session_id: session_id || null,
      sampled: sampled ?? true,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const hours = parseInt(searchParams.get("hours") || "24")

    const hotelId = searchParams.get("hotel_id")
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from("perf_web_vitals")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500)
    if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    }
    const { data: metrics, error } = await query

    if (error) throw error

    // Group by metric name and calculate stats
    const stats: Record<string, { values: number[]; ratings: Record<string, number> }> = {}

    for (const m of metrics || []) {
      if (!stats[m.name]) {
        stats[m.name] = { values: [], ratings: { good: 0, "needs-improvement": 0, poor: 0 } }
      }
      stats[m.name].values.push(Number(m.value))
      if (m.rating && stats[m.name].ratings[m.rating] !== undefined) {
        stats[m.name].ratings[m.rating]++
      }
    }

    const summary = Object.entries(stats).map(([name, data]) => {
      const sorted = [...data.values].sort((a, b) => a - b)
      return {
        name,
        count: data.values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
        avg: data.values.length > 0 ? Math.round(data.values.reduce((a, b) => a + b, 0) / data.values.length) : 0,
        ratings: data.ratings,
      }
    })

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalMetrics: (metrics || []).length,
      summary,
      recentMetrics: (metrics || []).slice(0, 20).map((m) => ({
        name: m.name,
        value: Number(m.value),
        rating: m.rating,
        path: m.path,
        timestamp: m.created_at,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch vitals", detail: String(err) }, { status: 500 })
  }
}
