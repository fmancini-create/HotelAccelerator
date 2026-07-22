// Cron job endpoint for automated sync and ETL
// Runs every 30 minutes to sync PMS data and process it
// UNIFIED FLOW: ScidooSyncService -> PMSImportService -> public.bookings
// PMS-AGNOSTIC: dashboard reads from public.bookings, public.daily_availability

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isServiceUnavailableError, logSupabaseError } from "@/lib/supabase/error-utils"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { GSheetsSyncService } from "@/lib/services/gsheets-sync-service"
import { logSyncErrors, autoResolveStaleSyncErrors } from "@/lib/services/sync-error-logger"
import { invalidateHotelCache } from "@/lib/cache/redis"

// FIX 04/05/2026: bump implicit 60s -> 300s (cap Vercel Pro). Il cron
// itera su tutti gli hotel attivi (~6 hotel oggi), per ognuno fa sync
// PMS + ETL + queue drain pricing. Un backfill esteso (es. 240gg per
// hotel autopilot) puo' richiedere oltre 60s solo nella fase drain,
// causando timeout della lambda PRIMA del drain stesso. Risultato: gli
// item restano pending indefinitamente e l'autopilot non pusha al PMS.
// 300s e' il massimo concesso da Vercel Pro.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = await createServiceRoleClient()

    // Get all active PMS integrations che hanno sync_configs.auto_sync_enabled = true
    const { data: syncConfigs, error: scError } = await supabase
      .from("sync_configs")
      .select("hotel_id, auto_sync_enabled, sync_interval_minutes, last_sync_at, sync_start_date, sync_end_date")
      .eq("auto_sync_enabled", true)

    if (scError) {
      throw new Error(`Failed to fetch sync_configs: ${scError.message}`)
    }

    // Filtra hotel il cui ultimo sync e' piu' vecchio dell'intervallo configurato
    const now = Date.now()
    const eligibleHotelIds = (syncConfigs || [])
      .filter((sc) => {
        if (!sc.last_sync_at) return true // mai sincronizzato -> sync subito
        const elapsed = now - new Date(sc.last_sync_at).getTime()
        const intervalMs = (sc.sync_interval_minutes || 360) * 60 * 1000
        return elapsed >= intervalMs
      })
      .map((sc) => sc.hotel_id)

    // FIX 05/05/2026 (incident "Barronci 62k variazioni mai notificate
    // dopo il fix di ieri"): drain queue + sweep retryFailedPushes devono
    // girare a OGNI ciclo cron (15min), indipendentemente dal fatto che
    // qualche hotel sia eligible al sync PMS. Prima erano sotto l'early-
    // return della riga `eligibleHotelIds.length===0` quindi se nessun
    // hotel aveva scaduto il proprio sync_interval_minutes (default 6h)
    // il route usciva subito senza drenare il backlog. Risultato: 60k
    // righe `none` accumulate senza mai essere notificate. Spostando i
    // due passi all'inizio (in helpers fuori dal flow per-hotel), girano
    // sempre. Il sync PMS resta condizionato dall'eligibility.
    // FIX 11/05/2026: Trigger ricalcolo Last Minute per date che oggi entrano
    // nella finestra LM. Senza questo, il prezzo con LM non viene mai calcolato
    // perché non c'è evento che scatena il ricalcolo quando i giorni diminuiscono.
    const lmTriggerResult = await triggerLastMinuteRecalcForToday()

    const { queueProcessed: earlyQueueProcessed, retrySwept: earlyRetrySwept } =
      await runQueueDrainAndRetrySweep()

    // Evaluate custom alert rules for all hotels (availability-based alerts)
    const alertsResult = await runCustomAlertEvaluation()

    if (eligibleHotelIds.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        results: [],
        lastMinuteTrigger: lmTriggerResult,
        queue: earlyQueueProcessed,
        retry: earlyRetrySwept,
        alerts: alertsResult,
        message: "Nessun hotel da sincronizzare in questo ciclo (LM trigger + queue drain + retry sweep + custom alerts eseguiti comunque)",
      })
    }

    // Crea una mappa per accesso rapido alle config
    const configMap = new Map(syncConfigs?.map((sc) => [sc.hotel_id, sc]) || [])

    const { data: integrations, error: integrationsError } = await supabase
      .from("pms_integrations")
      .select("*, hotels(id, name)")
      .eq("is_active", true)
      .in("hotel_id", eligibleHotelIds)

    if (integrationsError) {
      throw new Error(`Failed to fetch integrations: ${integrationsError.message}`)
    }

    console.log("[v0] Cron: Found", integrations?.length || 0, "integrations eligible for sync")

    const results = []

    for (const integration of integrations || []) {
      try {
        const hotelName = integration.hotels?.name || integration.hotel_id
        console.log("[v0] Cron: Processing hotel", hotelName, integration.hotel_id)

        // Calculate date range for sync
        // dateFrom: 7 giorni fa (cattura modifiche/cancellazioni recenti)
        // dateTo: 365 giorni nel futuro (cattura prenotazioni con check-in futuro)
        const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        const dateTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

        const integrationMode = integration.integration_mode || "api"
        console.log("[v0] Cron: integration_mode:", integrationMode, "pms_name:", integration.pms_name)

        // Route basato su integration_mode (non su pms_name)
        if (integrationMode === "gsheets") {
          // -- MODALITA' GSHEETS: legge dal Google Sheet configurato --
          const spreadsheetId = integration.gsheet_spreadsheet_id
          const gsheetsMapping = (integration.config as any)?.gsheets_mapping

          if (!spreadsheetId || !gsheetsMapping) {
            console.warn("[v0] Cron: GSheets mode but missing spreadsheet/mapping for", hotelName)
            results.push({
              hotel_id: integration.hotel_id,
              hotel_name: hotelName,
              skipped: true,
              reason: "Missing gsheet_spreadsheet_id or gsheets_mapping config",
            })
            continue
          }

          const syncResult = await GSheetsSyncService.syncAll(
            integration.hotel_id,
            spreadsheetId,
            gsheetsMapping,
          )

          console.log("[v0] Cron: GSheets sync completed for", hotelName, {
            success: syncResult.success,
            bookings: syncResult.bookings?.imported || 0,
            availability: syncResult.availability?.imported || 0,
            roomTypes: syncResult.roomTypes?.imported || 0,
          })

          // Box 9: Log errori individuali nella tabella sync_errors
          if (syncResult.bookings?.errors?.length) {
            await logSyncErrors(supabase, integration.hotel_id, "bookings", integration.pms_name || "bedzzle", syncResult.bookings.errors)
          }

          // Run ETL to transform RAW/GSheets data into normalized tables
          try {
            const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")
            const etl = new ETLOrchestrator({
              hotel_id: integration.hotel_id,
              job_type: "full_sync",
              triggered_by: "cron_gsheets_sync",
            })
            const etlResult = await etl.run()
            console.log("[v0] Cron: ETL completed for GSheets hotel", hotelName, etlResult)
            await invalidateHotelCache(integration.hotel_id).catch(() => {})
          } catch (etlError) {
            console.error("[v0] Cron: ETL failed for GSheets hotel", hotelName, "(non-blocking):", etlError)
          }

          results.push({
            hotel_id: integration.hotel_id,
            hotel_name: hotelName,
            sync: {
              success: syncResult.success,
              bookings_imported: syncResult.bookings?.imported || 0,
              bookings_errors: syncResult.bookings?.errors?.length || 0,
              availability_imported: syncResult.availability?.imported || 0,
              room_types_imported: syncResult.roomTypes?.imported || 0,
              fiscal_production_imported: 0,
            },
            error: syncResult.error,
          })
        } else if (integrationMode === "api" && integration.pms_name === "scidoo") {
          // -- MODALITA' API (Scidoo) --
          const syncResult = await ScidooSyncService.syncAll(
            integration.hotel_id,
            integration.api_key,
            dateFrom,
            dateTo,
          )

          console.log("[v0] Cron: Scidoo sync completed for", hotelName, {
            success: syncResult.success,
            bookings: syncResult.bookings?.imported || 0,
            availability: syncResult.availability?.imported || 0,
            roomTypes: syncResult.roomTypes?.imported || 0,
          })

          // Box 9: Log errori individuali nella tabella sync_errors
          if (syncResult.bookings?.errors?.length) {
            await logSyncErrors(supabase, integration.hotel_id, "bookings", "scidoo", syncResult.bookings.errors)
          }

          // Run ETL to transform RAW data into normalized tables (daily_production, etc.)
          try {
            const { ETLOrchestrator } = await import("@/lib/etl/etl-orchestrator")
            const etl = new ETLOrchestrator({
              hotel_id: integration.hotel_id,
              job_type: "full_sync",
              date_from: dateFrom,
              date_to: dateTo,
              triggered_by: "cron_sync",
            })
            const etlResult = await etl.run()
            console.log("[v0] Cron: ETL completed for", hotelName, etlResult)
            await invalidateHotelCache(integration.hotel_id).catch(() => {})
          } catch (etlError) {
            console.error("[v0] Cron: ETL failed for", hotelName, "(non-blocking):", etlError)
          }

          results.push({
            hotel_id: integration.hotel_id,
            hotel_name: hotelName,
            sync: {
              success: syncResult.success,
              bookings_imported: syncResult.bookings?.imported || 0,
              bookings_errors: syncResult.bookings?.errors?.length || 0,
              availability_imported: syncResult.availability?.imported || 0,
              room_types_imported: syncResult.roomTypes?.imported || 0,
              fiscal_production_imported: syncResult.production?.imported || 0,
            },
            error: syncResult.error,
          })
        } else if (integration.pms_name === "slope" || integration.pms_name === "brig") {
          // slope e brig NON sono gestiti da questo cron: la sincronizzazione
          // prenotazioni avviene nel cron sync-modules (modulo 'reservations',
          // vedi pms_cron_settings) o dal pulsante manuale "Sync ora". Qui NON e'
          // un errore: e' una delega architetturale. Logghiamo info (non warning)
          // per non generare rumore ad ogni run (~ogni 35 min).
          console.log("[v0] Cron: skip", integration.pms_name, "per", hotelName, "- gestito da sync-modules/manuale, non da sync-and-etl")
          results.push({
            hotel_id: integration.hotel_id,
            hotel_name: hotelName,
            skipped: true,
            reason: `Delegato a sync-modules: pms=${integration.pms_name}`,
          })
        } else {
          console.warn("[v0] Cron: Unsupported integration mode/pms:", integrationMode, integration.pms_name, "for", hotelName)
          results.push({
            hotel_id: integration.hotel_id,
            hotel_name: hotelName,
            skipped: true,
            reason: `Unsupported: mode=${integrationMode}, pms=${integration.pms_name}`,
          })
        }

        // Box 9: Auto-resolve errori non piu' ricorrenti (non visti da 7+ giorni)
        await autoResolveStaleSyncErrors(supabase, integration.hotel_id)

        // Update last sync timestamp in sync_configs
        const sc = configMap.get(integration.hotel_id)
        const intervalMs = ((sc?.sync_interval_minutes || 360) * 60 * 1000)
        await supabase
          .from("sync_configs")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
            last_sync_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("hotel_id", integration.hotel_id)

        // Update pms_integrations too
        await supabase
          .from("pms_integrations")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "success",
            next_sync_at: new Date(Date.now() + intervalMs).toISOString(),
          })
          .eq("id", integration.id)
      } catch (error) {
        console.error("[v0] Cron: Error processing hotel", integration.hotel_id, error)

        // Update sync_configs with error
        await supabase
          .from("sync_configs")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: error instanceof Error ? error.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("hotel_id", integration.hotel_id)

        // Update pms_integrations with error
        const sc = configMap.get(integration.hotel_id)
        const intervalMs = ((sc?.sync_interval_minutes || 360) * 60 * 1000)
        await supabase
          .from("pms_integrations")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "failed",
            last_sync_error: error instanceof Error ? error.message : "Unknown error",
            next_sync_at: new Date(Date.now() + intervalMs).toISOString(),
          })
          .eq("id", integration.id)

        results.push({
          hotel_id: integration.hotel_id,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: integrations?.length || 0,
      results,
      lastMinuteTrigger: lmTriggerResult,
      queue: earlyQueueProcessed,
      retry: earlyRetrySwept,
      alerts: alertsResult,
    })
  } catch (error) {
    // FIX 31/05/2026: un outage Supabase (gateway Cloudflare 5xx -> pagina
    // HTML) non e' un errore applicativo. Logga compatto (mai il blob HTML)
    // e rispondi 503 transitorio invece di 500.
    logSupabaseError("sync-and-etl", error)
    const transient = isServiceUnavailableError(error)
    return NextResponse.json(
      {
        error: transient
          ? "Supabase temporarily unavailable"
          : error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: transient ? 503 : 500 },
    )
  }
}

/**
 * Trigger ricalcolo prezzi per date che oggi entrano nella finestra Last Minute.
 * Il Last Minute è basato sui giorni al check-in (es. "entro 2 giorni").
 * Ogni giorno, nuove date entrano nella finestra (ieri il 12/05 era a 2 giorni,
 * oggi è a 1 giorno). Senza questo trigger, il prezzo con LM non verrebbe mai
 * calcolato perché non c'è nessun altro evento che scatena il ricalcolo.
 */
async function triggerLastMinuteRecalcForToday(): Promise<{ queued: number; hotels: string[] }> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = await createServiceRoleClient()

    // Trova tutti gli hotel con autopilot attivo (mode = 'autopilot' o 'notify')
    const { data: autopilotHotels } = await supabase
      .from("autopilot_configs")
      .select("hotel_id, mode")
      .in("mode", ["autopilot", "notify"])

    if (!autopilotHotels || autopilotHotels.length === 0) {
      return { queued: 0, hotels: [] }
    }

    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]
    // Ricalcola i prossimi 7 giorni (finestra tipica LM)
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    const endStr = endDate.toISOString().split("T")[0]

    const queuedHotels: string[] = []

    for (const hotel of autopilotHotels) {
      // Verifica se c'è già un item pending per oggi (evita duplicati)
      const { data: existing } = await supabase
        .from("pricing_recalc_queue")
        .select("id")
        .eq("hotel_id", hotel.hotel_id)
        .eq("trigger_type", "last_minute_daily")
        .eq("status", "pending")
        .gte("created_at", todayStr + "T00:00:00Z")
        .limit(1)

      if (existing && existing.length > 0) {
        continue // Già in coda per oggi
      }

      // Inserisci in coda (solo colonne esistenti nello schema)
      const { error } = await supabase.from("pricing_recalc_queue").insert({
        hotel_id: hotel.hotel_id,
        trigger_type: "last_minute_daily",
        date_range_start: todayStr,
        date_range_end: endStr,
        status: "pending",
      })

      if (!error) {
        queuedHotels.push(hotel.hotel_id)
      }
    }

    console.log("[v0] Cron: Last Minute daily recalc queued for", queuedHotels.length, "hotels")
    return { queued: queuedHotels.length, hotels: queuedHotels }
  } catch (err) {
    console.error("[v0] Cron: Last Minute daily trigger error:", err)
    return { queued: 0, hotels: [] }
  }
}

/**
 * Drain pricing_recalc_queue inline + sweep failed autopilot pushes per retry.
 * Eseguito a OGNI ciclo cron (15min), indipendentemente dall'eligibility
 * degli hotel al sync PMS. Vedi commento al chiamante per il razionale.
 *
 * - processPendingPricingQueue: vuota la queue di recalc accumulata da
 *   triggerPriceRecalculation (fire-and-forget). Il cron dedicato
 *   `/api/accelerator/process-pricing-queue` declared in vercel.json
 *   viene droppato su Vercel Pro al register, qui copriamo il gap.
 * - retryFailedPushes(2000): pesca fino a 2000 righe orfane/scheduled
 *   da price_change_log e le passa a executeAutopilotAction grouppate
 *   per hotel. Cap MAX_NOTIFY_BATCH=5000 dentro la action drena per
 *   hotel notify; cap MAX_PUSH_BATCH=1000 per autopilot.
 */
async function runQueueDrainAndRetrySweep(): Promise<{
  queueProcessed: unknown
  retrySwept: unknown
}> {
  let queueProcessed: unknown = null
  try {
    const { processPendingPricingQueue } = await import("@/lib/pricing/process-queue")
    queueProcessed = await processPendingPricingQueue({ maxItems: 20 })
    console.log("[v0] Cron: pricing queue drained:", queueProcessed)
  } catch (queueErr) {
    console.error("[v0] Cron: pricing queue drain error (non-blocking):", queueErr)
    queueProcessed = { error: queueErr instanceof Error ? queueErr.message : "Unknown error" }
  }

  let retrySwept: unknown = null
  try {
    const { retryFailedPushes } = await import("@/lib/pricing/auto-trigger")
    retrySwept = await retryFailedPushes(2000)
    console.log("[v0] Cron: failed pushes retry sweep:", retrySwept)
  } catch (retryErr) {
    console.error("[v0] Cron: retry sweep error (non-blocking):", retryErr)
    retrySwept = { error: retryErr instanceof Error ? retryErr.message : "Unknown error" }
  }

  return { queueProcessed, retrySwept }
}

/**
 * Evaluate custom alert rules for all hotels.
 * Runs at every cron cycle to check availability-based conditions.
 */
async function runCustomAlertEvaluation(): Promise<{
  evaluated: number
  triggered: number
  errors: string[]
}> {
  try {
    const { evaluateCustomAlertRules } = await import("@/lib/services/custom-alert-service")
    const result = await evaluateCustomAlertRules()
    console.log("[v0] Cron: custom alerts evaluated:", result)
    return result
  } catch (err) {
    console.error("[v0] Cron: custom alert evaluation error (non-blocking):", err)
    return { evaluated: 0, triggered: 0, errors: [err instanceof Error ? err.message : "Unknown error"] }
  }
}
