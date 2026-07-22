import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// --- Modello "costi reali ripartiti" (13/07/2026) ---
// I costi FISSI reali della piattaforma (in USD/mese) vengono RIPARTITI tra gli
// hotel in proporzione all'uso misurato, cosi' il totale della pagina coincide
// con la spesa vera (prima erano tariffe unitarie inventate e il totale non
// corrispondeva a nessuna fattura).
// Cambio USD->EUR (aggiornare se serve maggiore precisione).
const EUR_PER_USD = 0.92
// Supabase: piano Pro $25 + compute Medium $60 (upgrade del 13/07/2026 dopo
// l'esaurimento del Disk IO Budget sul taglio Micro -> outage 522).
// Ripartito per quota di RIGHE DB (storage e I/O crescono con le righe).
const SUPABASE_USD_PER_MONTH = 25 + 60
// Vercel: piano Pro $20/mese. Ripartito per quota di RUN DI SYNC nel periodo
// (le invocazioni serverless sono dominate dai sync/cron per-hotel).
const VERCEL_USD_PER_MONTH = 20
// GPT-4o-mini (prezzi reali): input $0,15/1M, output $0,60/1M token.
// Stima per messaggio: ~2000 token input + ~1000 output =>
// (2000*0,15 + 1000*0,60) / 1.000.000 = $0,0009 / messaggio.
// L'AI resta VARIABILE per messaggio: e' l'unico costo che scala direttamente.
const AI_USD_PER_MESSAGE = (2000 * 0.15 + 1000 * 0.6) / 1_000_000
const EMAIL_USD_PER_MONTH = 0.1

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Check superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "super_admin" && profile.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const serviceClient = await createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30" // days
    const periodDays = Math.max(1, parseInt(period) || 30)
    // Riporta a base mensile l'attivita' misurata nel periodo selezionato.
    const MONTHLY_FACTOR = 30 / periodDays

    // Get all hotels
    const { data: hotels } = await serviceClient
      .from("hotels")
      .select("id, name, total_rooms, is_active, created_at")
      .order("name")

    if (!hotels || hotels.length === 0) {
      return NextResponse.json({ hotels: [], usage: [], summary: {} })
    }

    const hotelIds = hotels.map((h) => h.id)

    // Get usage logs for period
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)
    const startDateStr = startDate.toISOString().split("T")[0]

    const { data: usageLogs } = await serviceClient
      .from("tenant_usage_logs")
      .select("*")
      .in("hotel_id", hotelIds)
      .gte("recorded_date", startDateStr)
      .order("recorded_date", { ascending: false })

    // Get subscription data for each hotel
    const { data: subscriptions } = await serviceClient
      .from("accelerator_subscriptions")
      .select("hotel_id, plan_type, fixed_fee_per_room, monthly_fee, commission_percentage, billing_cycle, is_active")
      .eq("is_active", true)

    const subscriptionMap = new Map(
      (subscriptions || []).map((s) => [s.hotel_id, s])
    )

    // Get LIVE metrics for each hotel (real-time data from existing tables)
    const liveMetrics = await Promise.all(
      hotels.map(async (hotel) => {
        const [
          bookingsResult,
          availabilityResult,
          syncLogsResult,
          syncPeriodResult,
          chatResult,
          metricsResult,
        ] = await Promise.all([
          serviceClient
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotel.id),
          serviceClient
            .from("daily_availability")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotel.id),
          // Ultimi 50 run: servono SOLO per durata media ed errori recenti.
          serviceClient
            .from("sync_logs")
            .select("id, status, started_at, completed_at, created_at")
            .eq("hotel_id", hotel.id)
            .order("created_at", { ascending: false })
            .limit(50),
          // Conteggio REALE dei run nel periodo selezionato (non solo "oggi").
          serviceClient
            .from("sync_logs")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotel.id)
            .gte("created_at", startDate.toISOString()),
          // Sessioni chat NEL PERIODO (prima erano limitate alle ultime 100,
          // sottostimando gli hotel con molto traffico).
          serviceClient
            .from("chat_sessions")
            .select("id, created_at")
            .eq("hotel_id", hotel.id)
            .gte("created_at", startDate.toISOString()),
          serviceClient
            .from("rms_metrics_history")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotel.id),
        ])

        const syncLogs = syncLogsResult.data || []
        const todaySyncs = syncLogs.filter(
          (s) => new Date(s.created_at).toDateString() === new Date().toDateString()
        )
        const syncErrors = syncLogs.filter((s) => s.status === "error")
        const syncsWithDuration = syncLogs.filter((s) => s.started_at && s.completed_at)
        const avgSyncMs =
          syncsWithDuration.length > 0
            ? Math.round(
                syncsWithDuration.reduce((sum, s) => {
                  const start = new Date(s.started_at).getTime()
                  const end = new Date(s.completed_at).getTime()
                  return sum + Math.max(0, end - start)
                }, 0) / syncsWithDuration.length
              )
            : 0

        const chatSessions = chatResult.data || []
        const chatSessionIds = chatSessions.map((s) => s.id)

        // Messaggi NEL PERIODO (created_at >= startDate), non di sempre.
        let totalMessages = 0
        if (chatSessionIds.length > 0) {
          const { count: msgCount } = await serviceClient
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .in("session_id", chatSessionIds)
            .gte("created_at", startDate.toISOString())
          totalMessages = msgCount || 0
        }

        // --- Metriche d'uso, normalizzate a 30 giorni ---
        // Le metriche di FLUSSO (sync, AI) sono misurate sul periodo selezionato
        // e riportate a base mensile con MONTHLY_FACTOR. Le righe DB sono uno
        // STOCK (accumulate), non si scalano col periodo. I costi per hotel NON
        // si calcolano qui: la ripartizione dei costi fissi richiede i TOTALI di
        // piattaforma, quindi avviene in un secondo passaggio dopo il map.
        const syncRunsPeriod = syncPeriodResult.count || 0
        const monthlySyncRuns = syncRunsPeriod * MONTHLY_FACTOR
        const monthlyMessages = totalMessages * MONTHLY_FACTOR
        const totalRows =
          (bookingsResult.count || 0) + (availabilityResult.count || 0) + (metricsResult.count || 0)

        const sub = subscriptionMap.get(hotel.id)

        return {
          hotel_id: hotel.id,
          hotel_name: hotel.name,
          total_rooms: hotel.total_rooms,
          is_active: hotel.is_active,
          subscription: sub ? {
            plan_type: sub.plan_type,
            fixed_fee_per_room: sub.fixed_fee_per_room ? Number(sub.fixed_fee_per_room) : null,
            monthly_fee: sub.monthly_fee ? Number(sub.monthly_fee) : null,
            commission_percentage: sub.commission_percentage ? Number(sub.commission_percentage) : null,
            billing_cycle: sub.billing_cycle,
          } : null,
          live: {
            db_rows_bookings: bookingsResult.count || 0,
            db_rows_availability: availabilityResult.count || 0,
            db_rows_metrics: metricsResult.count || 0,
            sync_runs_today: todaySyncs.length,
            sync_runs_total: syncRunsPeriod,
            sync_errors_recent: syncErrors.length,
            sync_avg_ms: avgSyncMs,
            ai_sessions: chatSessions.length,
            ai_messages_total: totalMessages,
            // Riempito nel secondo passaggio di ripartizione qui sotto.
            cost_estimated: { server: 0, database: 0, ai: 0, email: 0, total: 0 },
          },
          // Dati interni per la ripartizione (rimossi prima della risposta).
          _alloc: { totalRows, monthlySyncRuns, monthlyMessages },
        }
      })
    )

    // --- Ripartizione dei costi fissi reali sui totali di piattaforma ---
    // Supabase ($85: Pro+Medium) per quota di righe DB; Vercel ($20: Pro) per
    // quota di run di sync mensili. Se il totale di una metrica e' 0 (nessun
    // uso misurato), si ripartisce in parti uguali per non perdere costi.
    const platformRows = liveMetrics.reduce((s, m) => s + m._alloc.totalRows, 0)
    const platformSyncRuns = liveMetrics.reduce((s, m) => s + m._alloc.monthlySyncRuns, 0)
    const n = liveMetrics.length
    for (const m of liveMetrics) {
      const rowsShare = platformRows > 0 ? m._alloc.totalRows / platformRows : 1 / n
      const syncShare = platformSyncRuns > 0 ? m._alloc.monthlySyncRuns / platformSyncRuns : 1 / n
      const costDb = SUPABASE_USD_PER_MONTH * rowsShare * EUR_PER_USD
      const costServer = VERCEL_USD_PER_MONTH * syncShare * EUR_PER_USD
      const costAi = m._alloc.monthlyMessages * AI_USD_PER_MESSAGE * EUR_PER_USD
      const costEmail = EMAIL_USD_PER_MONTH * EUR_PER_USD
      m.live.cost_estimated = {
        server: Number(costServer.toFixed(4)),
        database: Number(costDb.toFixed(4)),
        ai: Number(costAi.toFixed(4)),
        email: Number(costEmail.toFixed(4)),
        total: Number((costServer + costDb + costAi + costEmail).toFixed(4)),
      }
    }
    // Rimuove i dati interni dalla risposta.
    const hotelsResponse = liveMetrics.map(({ _alloc, ...rest }) => rest)

    // Aggregate summary
    const summary = {
      total_hotels: hotels.length,
      active_hotels: hotels.filter((h) => h.is_active).length,
      total_cost_estimated: liveMetrics.reduce(
        (sum, m) => sum + m.live.cost_estimated.total,
        0
      ),
      total_db_rows: liveMetrics.reduce(
        (sum, m) =>
          sum +
          m.live.db_rows_bookings +
          m.live.db_rows_availability +
          m.live.db_rows_metrics,
        0
      ),
      total_sync_today: liveMetrics.reduce(
        (sum, m) => sum + m.live.sync_runs_today,
        0
      ),
      total_ai_messages: liveMetrics.reduce(
        (sum, m) => sum + m.live.ai_messages_total,
        0
      ),
    }

    return NextResponse.json({
      hotels: hotelsResponse,
      usage: usageLogs || [],
      summary,
    })
  } catch (error) {
    console.error("[tenant-usage] Error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
