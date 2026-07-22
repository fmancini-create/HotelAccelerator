import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ApifyReviewService } from "@/lib/services/apify-review-service"

/**
 * SCHEDULE-DRIVEN cron per la sync delle recensioni OTA via Apify.
 *
 * Architettura (vedi MEMORY.md > "Apify quota saturation 14/05/2026"):
 *
 *  - La tabella `review_platform_schedules` ha 1 riga per (hotel, platform)
 *    e contiene:
 *      * avg_days_between_reviews -> cadenza adattiva [1, 15] giorni calcolata
 *        dai dati storici di hotel_reviews
 *      * next_sync_at -> quando il cron deve riprovare quel canale
 *      * consecutive_empty_runs -> counter "0 nuove review trovate"
 *        a 3 consecutive il canale e' marcato is_dormant=true
 *      * manual_override_days -> override super-admin (sovrascrive avg)
 *
 *  - Il cron NON itera piu' "tutti gli hotel x tutte le platform" come prima
 *    (consumo Apify ~6000 scrape/giorno). Legge gli schedule dovuti adesso e
 *    fa 1 chiamata Apify mirata per ognuno.
 *
 *  - Schedule = orario in vercel.json. Cosi' un canale con avg=1 (Booking di
 *    Villa I Barronci) viene processato il giorno stesso senza attese di 24h,
 *    e un canale a avg=15 viene processato 2 volte al mese.
 *
 *  - Trigger manuali (tenant click "Sincronizza") restano sempre permessi e
 *    bypassano lo schedule: vedono `app/api/integrations/reviews/sync/route.ts`
 *    che chiama direttamente syncSinglePlatformForHotel + aggiorna lo schedule
 *    a sync_completata.
 *
 *  - Cap di sicurezza: max BATCH_SIZE schedule per run, ordinati per
 *    next_sync_at ASC (i piu' "in ritardo" prima). Il cron e' orario quindi
 *    in 24h si processano BATCH_SIZE*24 = 480 schedule max, ampio margine.
 */

export const maxDuration = 300

const BATCH_SIZE = 20
// Soglia oltre cui un canale viene marcato dormiente. Allineato con la
// documentazione utente ("dopo 3 sync vuote consecutive").
const DORMANT_THRESHOLD = 3
// Quando una sync fallisce per errore infra (quota Apify, actor down, URL
// non supportato), NON incrementiamo consecutive_empty_runs (un errore != un
// canale legittimamente dormiente). Riproviamo dopo BACKOFF_ERROR_HOURS.
const BACKOFF_ERROR_HOURS = 2

interface SchedulePayload {
  id: string
  hotel_id: string
  platform: string
  avg_days_between_reviews: number
  manual_override_days: number | null
  consecutive_empty_runs: number
  total_syncs: number
  total_reviews_found: number
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (process.env.VERCEL_ENV === "production" && process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const started = Date.now()
  const supabase = await createServiceRoleClient()

  // 1) Selezione schedule dovuti. Filtriamo lato DB su:
  //    - next_sync_at <= now() (e' tempo di sincronizzare)
  //    - is_dormant = false (canali dormienti restano fermi, super-admin li sveglia)
  // L'ordinamento per next_sync_at ASC favorisce gli schedule piu' in ritardo.
  const { data: schedules, error: schedErr } = await supabase
    .from("review_platform_schedules")
    .select(
      "id, hotel_id, platform, avg_days_between_reviews, manual_override_days, consecutive_empty_runs, total_syncs, total_reviews_found"
    )
    .lte("next_sync_at", new Date().toISOString())
    .eq("is_dormant", false)
    .order("next_sync_at", { ascending: true })
    .limit(BATCH_SIZE)

  if (schedErr) {
    return NextResponse.json({ error: schedErr.message }, { status: 500 })
  }

  const due = (schedules || []) as SchedulePayload[]

  // Origin per il fan-out su /api/reviews/insights quando una sync porta nuove
  // review (cosi' la card "Insights AI" della dashboard /dati/reviews si
  // aggiorna sola, senza forzare l'utente a cliccare "Ricalcola").
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

  const results: Array<{
    scheduleId: string
    hotelId: string
    platform: string
    status: "success" | "success_empty" | "error" | "dormant"
    newCount: number
    nextSyncAt: string | null
    error?: string
    insightsRefreshed?: boolean
  }> = []

  // Track hotel che hanno ricevuto almeno 1 nuova review nel batch, per
  // triggerare 1 sola volta il refresh insights per ognuno.
  const hotelsToRefreshInsights = new Set<string>()

  for (const sched of due) {
    // Loggiamo SEMPRE il run, anche se fallisce. Useful per audit super-admin.
    const runInsert = await supabase
      .from("review_sync_runs")
      .insert({
        schedule_id: sched.id,
        hotel_id: sched.hotel_id,
        platform: sched.platform,
        status: "running",
        trigger_source: "cron",
      })
      .select("id")
      .single()
    const runId = runInsert.data?.id ?? null

    try {
      const syncResult = await ApifyReviewService.syncSinglePlatformForHotel(
        sched.hotel_id,
        sched.platform as Parameters<typeof ApifyReviewService.syncSinglePlatformForHotel>[1]
      )

      const isErrorFromApify = !syncResult.success
      const newCount = syncResult.newCount ?? 0
      const seenCount = syncResult.reviewCount ?? 0

      // Cadenza effettiva (override > avg)
      const cadenceDays = Number(
        sched.manual_override_days != null
          ? sched.manual_override_days
          : sched.avg_days_between_reviews
      ) || 7

      let nextSyncAt: Date
      let newEmptyRuns = sched.consecutive_empty_runs
      let isDormantNow = false
      let dormantReason: string | null = null
      let newAvgDays = sched.avg_days_between_reviews
      let lastReviewFoundAt: string | null = null

      if (isErrorFromApify) {
        // Errore Apify: NON incrementiamo empty_runs (non e' colpa del canale).
        // Riproviamo dopo BACKOFF_ERROR_HOURS per non martellare in caso di
        // quota raggiunta / actor down.
        nextSyncAt = new Date(Date.now() + BACKOFF_ERROR_HOURS * 3600 * 1000)
      } else if (newCount > 0) {
        // Sync OK con nuove review. Reset empty counter e ricalcola avg
        // dai dati storici aggiornati (rolling window 90gg).
        newEmptyRuns = 0
        lastReviewFoundAt = new Date().toISOString()
        newAvgDays = await recomputeAvgDays(supabase, sched.hotel_id, sched.platform)
        const effectiveCadence = Number(
          sched.manual_override_days != null ? sched.manual_override_days : newAvgDays
        )
        nextSyncAt = new Date(Date.now() + effectiveCadence * 24 * 3600 * 1000)
        hotelsToRefreshInsights.add(sched.hotel_id)
      } else {
        // Sync OK ma 0 nuove review. Incrementa counter; se raggiunge la
        // soglia, marca dormiente. Resta in lista per il super-admin che puo'
        // risvegliarlo dalla pagina /superadmin/review-schedules.
        newEmptyRuns = sched.consecutive_empty_runs + 1
        if (newEmptyRuns >= DORMANT_THRESHOLD) {
          isDormantNow = true
          dormantReason = "no_new_reviews"
        }
        nextSyncAt = new Date(Date.now() + cadenceDays * 24 * 3600 * 1000)
      }

      // Update schedule
      await supabase
        .from("review_platform_schedules")
        .update({
          last_sync_at: new Date().toISOString(),
          last_review_found_at: lastReviewFoundAt ?? undefined,
          next_sync_at: nextSyncAt.toISOString(),
          consecutive_empty_runs: newEmptyRuns,
          avg_days_between_reviews: newAvgDays,
          is_dormant: isDormantNow ? true : sched.consecutive_empty_runs >= DORMANT_THRESHOLD ? true : false,
          dormant_since: isDormantNow ? new Date().toISOString() : undefined,
          dormant_reason: isDormantNow ? dormantReason : undefined,
          total_syncs: sched.total_syncs + 1,
          total_reviews_found: sched.total_reviews_found + newCount,
        })
        .eq("id", sched.id)

      // Update run log
      if (runId) {
        await supabase
          .from("review_sync_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: isErrorFromApify
              ? "error"
              : isDormantNow
              ? "dormant"
              : newCount > 0
              ? "success"
              : "success_empty",
            new_reviews_count: newCount,
            total_reviews_seen: seenCount,
            error_message: isErrorFromApify ? syncResult.message : null,
            next_sync_set_to: nextSyncAt.toISOString(),
          })
          .eq("id", runId)
      }

      results.push({
        scheduleId: sched.id,
        hotelId: sched.hotel_id,
        platform: sched.platform,
        status: isErrorFromApify
          ? "error"
          : isDormantNow
          ? "dormant"
          : newCount > 0
          ? "success"
          : "success_empty",
        newCount,
        nextSyncAt: nextSyncAt.toISOString(),
        error: isErrorFromApify ? syncResult.message : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      const nextSyncAt = new Date(Date.now() + BACKOFF_ERROR_HOURS * 3600 * 1000)
      await supabase
        .from("review_platform_schedules")
        .update({
          last_sync_at: new Date().toISOString(),
          next_sync_at: nextSyncAt.toISOString(),
          total_syncs: sched.total_syncs + 1,
        })
        .eq("id", sched.id)
      if (runId) {
        await supabase
          .from("review_sync_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: "error",
            error_message: msg,
            next_sync_set_to: nextSyncAt.toISOString(),
          })
          .eq("id", runId)
      }
      results.push({
        scheduleId: sched.id,
        hotelId: sched.hotel_id,
        platform: sched.platform,
        status: "error",
        newCount: 0,
        nextSyncAt: nextSyncAt.toISOString(),
        error: msg,
      })
    }
  }

  // Fan-out refresh insights per hotel con nuove review (best-effort, non blocca)
  for (const hotelId of hotelsToRefreshInsights) {
    try {
      const insightsRes = await fetch(`${origin}/api/reviews/insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CRON_SECRET
            ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ hotelId }),
      })
      const r = results.find((x) => x.hotelId === hotelId)
      if (r) r.insightsRefreshed = insightsRes.ok
    } catch (err) {
      console.error("[cron/sync-reviews] insights refresh failed", hotelId, err)
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    scheduledDue: due.length,
    processed: results.length,
    successful: results.filter((r) => r.status === "success").length,
    emptyRuns: results.filter((r) => r.status === "success_empty").length,
    errors: results.filter((r) => r.status === "error").length,
    newlyDormant: results.filter((r) => r.status === "dormant").length,
    newReviewsTotal: results.reduce((s, r) => s + r.newCount, 0),
    results,
  })
}

/**
 * Ricalcola la media giorni tra recensioni di un canale usando i dati
 * storici degli ultimi 90 giorni (rolling window). Cosi' un hotel che ha
 * cambiato volume recensioni nel tempo (es. nuova stagione) vede la
 * cadenza adattarsi senza interventi manuali.
 *
 * Se < 5 review nei 90gg: cade su 7gg di default.
 * Clamp [1, 15] giorni come da spec utente.
 */
async function recomputeAvgDays(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  hotelId: string,
  platform: string
): Promise<number> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("hotel_reviews")
    .select("review_date")
    .eq("hotel_id", hotelId)
    .eq("platform", platform)
    .gte("review_date", ninetyDaysAgo)
    .order("review_date", { ascending: true })

  if (error || !data || data.length < 5) return 7

  const dates = data
    .map((r) => (r.review_date ? new Date(r.review_date).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
  if (dates.length < 5) return 7
  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const diffDays = (newest - oldest) / 86400000
  const avg = diffDays / (dates.length - 1)
  // Clamp [1, 15]
  return Math.max(1, Math.min(15, Number(avg.toFixed(2))))
}
