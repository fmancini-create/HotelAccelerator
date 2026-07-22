/**
 * CRON endpoint for daily pricing health check.
 *
 * Schedule: 0 7 * * * (07:00 UTC = 09:00 Italy summer / 08:00 Italy winter)
 *
 * Detects 4 categories of anomalies and emails superadmins ONLY when at
 * least one is non-empty (no all-clear emails — by user decision):
 *
 *   1. Coverage gaps    — hotels with future pricing_grid dates not pushed
 *                         to PMS (coverage_pct < 95%).
 *   2. Stalled queue    — pricing_recalc_queue rows pending > 2h.
 *   3. Permanent fails  — price_change_log rows with retry_count >= 5
 *                         (or next_retry_at NULL) at action_taken='none'.
 *   4. Old pending      — price_change_log rows still 'none' after 6h
 *                         (canary for triggers that didn't fire).
 *
 * Recipients: every profile with role='super_admin' AND is_active=true.
 * Fallback to ADMIN_EMAIL env var (or info@santaddeo.com) if no super_admin
 * found, with warning log.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { computeCoverageForAllHotels } from "@/lib/pricing/coverage-report"
import { requireCronAuth } from "@/lib/cron-auth"
import { sendEmail } from "@/lib/email"
import {
  buildPricingHealthEmail,
  type PricingHealthAnomalies,
} from "@/lib/email/templates/pricing-health-report"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min — coverage scan can be heavy

const STALLED_QUEUE_HOURS = 2
const OLD_PENDING_HOURS = 6

/**
 * Fetch paginato (PostgREST cappa ogni response a 1000 righe). Ordina per la PK
 * univoca `id` per una paginazione stabile (evita salti/duplicati ai confini di
 * pagina su colonne non univoche). Usato per contare accuratamente i fail:
 * senza paginazione un hotel con >1000 righe veniva sotto-contato (es. 2063
 * righe Barronci riportate come 877 per via del vecchio `.limit(2000)` globale).
 */
async function fetchAllPagesById<T>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await build(offset, offset + pageSize - 1).order("id", { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  console.log("[v0] [pricing-health] Starting daily health check")

  try {
    const supabase = await createServiceRoleClient()

    // ──────────────────────────────────────────────────────────────────
    // 1. Coverage gaps. Compute fresh coverage for every hotel with
    //    autopilot_configs.mode in (autopilot, notify) and keep only the
    //    ones below the 95% threshold.
    // ──────────────────────────────────────────────────────────────────
    let coverageIssues: PricingHealthAnomalies["coverageIssues"] = []
    try {
      const all = await computeCoverageForAllHotels()
      // FIX 15/05/2026: oltre a 'ok', escludiamo anche 'not_applicable'
      // (hotel in mode='notify' che per design non pushano al PMS).
      // Prima Barronci generava alert giornaliero falso positivo con 8%
      // coverage = critical.
      // FIX 29/05/2026: escludiamo anche 'unknown' (config non leggibile al
      // momento del calcolo). Gli hotel con dato non affidabile (lettura
      // troncata) vengono gia' esclusi a monte: computeCoverageForHotel
      // lancia PartialReadError e Promise.allSettled li scarta dal report.
      coverageIssues = all.filter(
        (r) =>
          r.health.status !== "ok" &&
          r.health.status !== "not_applicable" &&
          r.health.status !== "unknown",
      )
    } catch (err) {
      console.error("[v0] [pricing-health] coverage error:", err)
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. Stalled queue items: pending older than 2 hours.
    // ──────────────────────────────────────────────────────────────────
    const stalledThresholdIso = new Date(
      Date.now() - STALLED_QUEUE_HOURS * 3_600_000,
    ).toISOString()
    const { data: stalledRows } = await supabase
      .from("pricing_recalc_queue")
      .select("hotel_id, created_at, hotels!inner(name)")
      .eq("status", "pending")
      .lte("created_at", stalledThresholdIso)
      .limit(500)

    const stalledByHotel = new Map<
      string,
      { hotel_name: string | null; ages: number[] }
    >()
    for (const row of stalledRows || []) {
      const hid = row.hotel_id as string
      const ageH =
        (Date.now() - new Date(row.created_at as string).getTime()) / 3_600_000
      const name = (row.hotels as any)?.name ?? null
      if (!stalledByHotel.has(hid)) stalledByHotel.set(hid, { hotel_name: name, ages: [] })
      stalledByHotel.get(hid)!.ages.push(ageH)
    }
    const stalledQueueItems: PricingHealthAnomalies["stalledQueueItems"] =
      Array.from(stalledByHotel, ([hotel_id, v]) => ({
        hotel_id,
        hotel_name: v.hotel_name,
        age_hours: Math.max(...v.ages),
        pending_count: v.ages.length,
      })).sort((a, b) => b.age_hours - a.age_hours)

    // ──────────────────────────────────────────────────────────────────
    // 3. Permanent failures: retry budget exhausted (count >= 5 OR
    //    next_retry_at IS NULL while action_taken='none').
    //    Limit window to last 7 days to avoid surfacing ancient noise.
    // ──────────────────────────────────────────────────────────────────
    const sevenDaysAgoIso = new Date(
      Date.now() - 7 * 24 * 3_600_000,
    ).toISOString()
    // Paginato + con le chiavi di cella, per contare in modo accurato ed
    // escludere i FALSI POSITIVI (vedi sotto).
    const failRows = await fetchAllPagesById<{
      hotel_id: string
      room_type_id: string | null
      rate_id: string | null
      occupancy: number | null
      target_date: string | null
      last_error: string | null
      hotels: { name: string | null } | null
    }>((from, to) =>
      supabase
        .from("price_change_log")
        .select("id, hotel_id, room_type_id, rate_id, occupancy, target_date, last_error, hotels!inner(name)")
        .eq("action_taken", "none")
        .gte("retry_count", 5)
        .gte("changed_at", sevenDaysAgoIso)
        .range(from, to),
    )

    // FIX 01/07/2026 (falso positivo "Push falliti permanentemente"):
    // una riga di log congelata a retry_count=5 NON e' un fallimento reale se la
    // sua cella e' stata poi consegnata con successo. Accade quando una cella
    // fallisce 5 volte, resta orfana a 'none', e un recalc SUCCESSIVO la ri-pusha
    // correttamente (nuova riga confermata) senza mai aggiornare quella vecchia.
    // Escludiamo quindi le celle CONFERMATE = presenti in last_sent_prices con
    // prezzo == pricing_grid corrente. Restano contate solo le celle davvero non
    // consegnate o in drift (prezzo diverso da quello inviato).
    const affectedHotelIds = Array.from(new Set((failRows || []).map((r) => r.hotel_id)))
    const cellKey = (h: string, rt: unknown, ra: unknown, oc: unknown, d: unknown) =>
      `${h}|${rt}|${ra}|${oc}|${d}`
    const deliveredKeys = new Set<string>()
    if (affectedHotelIds.length > 0) {
      // Range date coinvolto (min..max) per limitare la lettura di grid/sent.
      const dates = (failRows || []).map((r) => r.target_date).filter((d): d is string => !!d).sort()
      const minDate = dates[0]
      const maxDate = dates[dates.length - 1]
      const [gridRows, sentRows] = await Promise.all([
        fetchAllPagesById<any>((from, to) =>
          supabase
            .from("pricing_grid")
            .select("id, hotel_id, room_type_id, rate_id, occupancy, date, price")
            .in("hotel_id", affectedHotelIds)
            .gte("date", minDate)
            .lte("date", maxDate)
            .range(from, to),
        ),
        fetchAllPagesById<any>((from, to) =>
          supabase
            .from("last_sent_prices")
            .select("id, hotel_id, room_type_id, rate_id, occupancy, target_date, last_price")
            .in("hotel_id", affectedHotelIds)
            .gte("target_date", minDate)
            .lte("target_date", maxDate)
            .range(from, to),
        ),
      ])
      const gridMap = new Map<string, number>()
      for (const g of gridRows) {
        gridMap.set(cellKey(g.hotel_id, g.room_type_id, g.rate_id, g.occupancy, g.date), Number(g.price))
      }
      for (const s of sentRows) {
        const k = cellKey(s.hotel_id, s.room_type_id, s.rate_id, s.occupancy, s.target_date)
        const grid = gridMap.get(k)
        // Consegnata = inviata E allineata al prezzo corrente del grid (tolleranza 0.5).
        if (grid !== undefined && Math.abs(grid - Number(s.last_price)) <= 0.5) deliveredKeys.add(k)
      }
    }

    const failByHotel = new Map<
      string,
      { hotel_name: string | null; count: number; last_error: string | null }
    >()
    for (const row of failRows || []) {
      const hid = row.hotel_id as string
      const k = cellKey(hid, row.room_type_id, row.rate_id, row.occupancy, row.target_date)
      if (deliveredKeys.has(k)) continue // falso positivo: cella gia' consegnata
      const name = (row.hotels as any)?.name ?? null
      if (!failByHotel.has(hid))
        failByHotel.set(hid, { hotel_name: name, count: 0, last_error: null })
      const entry = failByHotel.get(hid)!
      entry.count++
      if (row.last_error && !entry.last_error) entry.last_error = row.last_error as string
    }
    const permanentFailures: PricingHealthAnomalies["permanentFailures"] =
      Array.from(failByHotel, ([hotel_id, v]) => ({
        hotel_id,
        hotel_name: v.hotel_name,
        failed_count: v.count,
        last_error: v.last_error,
      })).sort((a, b) => b.failed_count - a.failed_count)

    // ──────────────────────────────────────────────────────────────────
    // 4. Old pending changes: 'none' after 6h with NO retry scheduled
    //    (otherwise they're already covered by the retry sweep). This
    //    catches rows that never got picked up by executeAutopilotAction
    //    in the first place — usually a sign of a missing trigger.
    //
    //    HARDENING 02/05/2026: doppio guard contro il rumore legacy.
    //      a) Window di 7 giorni: righe più vecchie sono fossili
    //         (vedi cleanup cap-1000 del 02/05/2026, ~130k righe). Le
    //         vere anomalie correnti vanno colte entro pochi giorni,
    //         non settimane.
    //      b) Esclusione `source='algorithm'`: quella source non viene
    //         piu' inserita da `recalculate-queued-prices.ts` (codice
    //         morto), quindi qualsiasi riga residua e' legacy noise.
    //         Le source attive con cui ci aspettiamo righe orfane sono
    //         `algo_param_change`, `manual_grid`, `drag_fill`,
    //         `bulk_fill`, `publish_suggested` (path manuale + cron).
    // ──────────────────────────────────────────────────────────────────
    const oldPendingThresholdIso = new Date(
      Date.now() - OLD_PENDING_HOURS * 3_600_000,
    ).toISOString()
    const oldPendingMaxAgeIso = new Date(
      Date.now() - 7 * 24 * 3_600_000,
    ).toISOString()
    const { data: pendingRows } = await supabase
      .from("price_change_log")
      .select("hotel_id, changed_at, hotels!inner(name)")
      .eq("action_taken", "none")
      .lte("changed_at", oldPendingThresholdIso)
      .gte("changed_at", oldPendingMaxAgeIso)
      .neq("source", "algorithm")
      .is("next_retry_at", null)
      .lt("retry_count", 5)
      .limit(2000)

    const pendingByHotel = new Map<
      string,
      { hotel_name: string | null; count: number; oldest: number }
    >()
    for (const row of pendingRows || []) {
      const hid = row.hotel_id as string
      const ageH =
        (Date.now() - new Date(row.changed_at as string).getTime()) / 3_600_000
      const name = (row.hotels as any)?.name ?? null
      if (!pendingByHotel.has(hid))
        pendingByHotel.set(hid, { hotel_name: name, count: 0, oldest: 0 })
      const entry = pendingByHotel.get(hid)!
      entry.count++
      if (ageH > entry.oldest) entry.oldest = ageH
    }
    const oldPendingChanges: PricingHealthAnomalies["oldPendingChanges"] =
      Array.from(pendingByHotel, ([hotel_id, v]) => ({
        hotel_id,
        hotel_name: v.hotel_name,
        pending_count: v.count,
        oldest_age_hours: v.oldest,
      })).sort((a, b) => b.oldest_age_hours - a.oldest_age_hours)

    const anomalies: PricingHealthAnomalies = {
      coverageIssues,
      stalledQueueItems,
      permanentFailures,
      oldPendingChanges,
    }

    const totalIssues =
      coverageIssues.length +
      stalledQueueItems.length +
      permanentFailures.length +
      oldPendingChanges.length

    console.log("[v0] [pricing-health] Anomalies summary:", {
      coverage: coverageIssues.length,
      stalled: stalledQueueItems.length,
      permanent: permanentFailures.length,
      oldPending: oldPendingChanges.length,
      total: totalIssues,
    })

    if (totalIssues === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "all clear",
        timestamp: new Date().toISOString(),
      })
    }

    // ──────────────────────────────────────────────────────────────────
    // Recipients: tutti i super_admin attivi. Fallback a ADMIN_EMAIL.
    // ──────────────────────────────────────────────────────────────────
    const { data: superAdmins } = await supabase
      .from("profiles")
      .select("email")
      .eq("is_active", true)
      .or("role.eq.super_admin,role.eq.superadmin")

    let recipients = (superAdmins || [])
      .map((p) => p.email)
      .filter((e): e is string => typeof e === "string" && e.includes("@"))

    if (recipients.length === 0) {
      const fallback = process.env.ADMIN_EMAIL || "info@santaddeo.com"
      console.warn(
        "[v0] [pricing-health] No active super_admin found, falling back to:",
        fallback,
      )
      recipients = [fallback]
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.santaddeo.com")

    const { subject, html, text } = buildPricingHealthEmail({
      anomalies,
      appUrl,
      reportDateIso: new Date().toISOString(),
    })

    const sendResult = await sendEmail({
      to: recipients,
      subject,
      html,
      type: "pricing_health_report",
      metadata: {
        coverage_issues: coverageIssues.length,
        stalled_queue: stalledQueueItems.length,
        permanent_failures: permanentFailures.length,
        old_pending: oldPendingChanges.length,
        text_preview: text.slice(0, 200),
      },
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      anomalies_total: totalIssues,
      anomalies_summary: {
        coverage: coverageIssues.length,
        stalled_queue: stalledQueueItems.length,
        permanent_failures: permanentFailures.length,
        old_pending: oldPendingChanges.length,
      },
      email: {
        sent: sendResult.success,
        messageId: sendResult.messageId,
        error: sendResult.error,
        recipientsCount: recipients.length,
      },
    })
  } catch (error) {
    console.error("[v0] [pricing-health] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
