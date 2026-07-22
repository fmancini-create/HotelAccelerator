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

    // 19/05/2026 fix: l'avg DB time veniva calcolato SOLO sui log
    // strumentati con measureDb (db_ms > 0). Cosi escludeva tutti gli
    // endpoint che non chiamano DB direttamente (es. /api/dati/analytics
    // che fa fetch http). Risultato: la card "Tempo medio DB" mostrava
    // 145ms anche se la maggioranza delle richieste reali aveva db_ms=0,
    // dando l'impressione che tutto fosse DB-bound. Ora separiamo:
    //  - avgDbTime / avgNonDbTime: media globale (tutti i log nella finestra)
    //  - dbCoverage: % di log con db_ms > 0 (quanto della pipeline e'
    //    strumentata con measureDb), per dare contesto al numero
    //  - recentDbLogs: lista filtrata dei log con db_ms > 0 (quella e'
    //    la "Ripartizione DB per Route", non l'avg).
    let allQ = supabase
      .from("perf_api_logs")
      .select("total_ms, db_ms, non_db_ms")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000)
    if (hotelId) allQ = allQ.eq("hotel_id", hotelId)
    const { data: allLogs, error: allErr } = await allQ
    if (allErr) throw allErr
    const all = allLogs || []
    const totalCount = all.length
    const withDb = all.filter(l => Number(l.db_ms) > 0)
    const avgDbTime = totalCount > 0
      ? Math.round(all.reduce((sum, l) => sum + Number(l.db_ms), 0) / totalCount)
      : 0
    const avgNonDbTime = totalCount > 0
      ? Math.round(all.reduce((sum, l) => sum + Number(l.non_db_ms), 0) / totalCount)
      : 0
    const dbCoverage = totalCount > 0
      ? Math.round((withDb.length / totalCount) * 1000) / 10
      : 0
    // 14/07/2026: media DB calcolata SOLO sui log strumentati con
    // measureDb (db_ms > 0). E' il numero "vero" del peso DB dove lo
    // misuriamo davvero; la media globale sopra resta come indicatore
    // di quanto il DB pesa sul totale del traffico osservato.
    const avgDbTimeInstrumented = withDb.length > 0
      ? Math.round(withDb.reduce((sum, l) => sum + Number(l.db_ms), 0) / withDb.length)
      : 0

    // Lista per la tabella "Ripartizione DB per Route": qui ha senso
    // filtrare db_ms > 0 (mostrare endpoint che non toccano DB
    // confonderebbe).
    let recentQ = supabase
      .from("perf_api_logs")
      .select("route, total_ms, db_ms, non_db_ms, created_at")
      .gte("created_at", since)
      .gt("db_ms", 0)
      .order("created_at", { ascending: false })
      .limit(20)
    if (hotelId) recentQ = recentQ.eq("hotel_id", hotelId)
    const { data: recent, error: recentErr } = await recentQ
    if (recentErr) throw recentErr

    const recentDbLogs = (recent || []).map(l => ({
      route: l.route,
      dbMs: Number(l.db_ms),
      nonDbMs: Number(l.non_db_ms),
      totalMs: Number(l.total_ms),
      timestamp: l.created_at,
    }))

    return NextResponse.json({
      avgDbTime,
      avgDbTimeInstrumented,
      avgNonDbTime,
      dbCoverage,
      instrumentedCount: withDb.length,
      totalCount,
      recentDbLogs,
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed", detail: String(err) }, { status: 500 })
  }
}
