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

    // Total count
    let countQ = supabase.from("perf_api_logs").select("id", { count: "exact", head: true }).gte("created_at", since)
    if (hotelId) countQ = countQ.eq("hotel_id", hotelId)
    const { count: totalRequests } = await countQ

    // 19/05/2026 fix: il count delle cold-start NON puo' derivare da
    // `coldLogs.length` perche' la query e' limitata a 20 (lista per la
    // tabella "Cold Logs Recenti"). Va calcolato con un count HEAD separato.
    // Bug pre-fix: con > 20 cold start reali, la dashboard mostrava
    // sempre 20 e una percentuale falsata (22% invece di 66% con 60/91).
    let coldCountQ = supabase
      .from("perf_api_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("cold_start", true)
    if (hotelId) coldCountQ = coldCountQ.eq("hotel_id", hotelId)
    const { count: coldStartCountRaw } = await coldCountQ

    // Cold start logs (lista per la UI, separata dal count)
    let coldQ = supabase
      .from("perf_api_logs")
      .select("route, method, total_ms, created_at")
      .gte("created_at", since)
      .eq("cold_start", true)
      .order("created_at", { ascending: false })
      .limit(20)
    if (hotelId) coldQ = coldQ.eq("hotel_id", hotelId)

    const { data: coldLogs, error } = await coldQ
    if (error) throw error

    const coldStartCount = coldStartCountRaw ?? 0
    const total = totalRequests ?? 0
    return NextResponse.json({
      totalRequests: total,
      coldStartCount,
      warmCount: total - coldStartCount,
      coldPercent: total > 0 ? Math.round((coldStartCount / total) * 1000) / 10 : 0,
      recentColdLogs: (coldLogs || []).map(l => ({
        route: l.route, method: l.method, totalMs: Number(l.total_ms), timestamp: l.created_at,
      })),
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed", detail: String(err) }, { status: 500 })
  }
}
