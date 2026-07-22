/**
 * Availability Sync Trigger — event-driven helper (12/05/2026 sera tardi)
 *
 * Quando arriva/cambia/cancella una prenotazione, dopo che bookings ETL e' stato
 * completato, questa utility:
 *   1. Fa un sync MIRATO di availability per (hotelId, dateFrom, dateTo) dal PMS
 *      ufficiale (Scidoo). NON deriviamo MAI availability dalle bookings: chiediamo
 *      sempre al PMS quello che lui calcola lato suo (allotment, stop sell,
 *      manutenzioni, blocchi OTA, restrictions inclusi).
 *   2. Esegue inline l'AvailabilityProcessor per popolare daily_availability e
 *      rms_availability_daily.
 *   3. Marca freshness in Redis cosi' /api/dati/freshness sa quando availability
 *      e' stata aggiornata l'ultima volta per quell'hotel.
 *
 * Protezione anti-concorrenza:
 *   - Lock Redis con TTL 60s per evitare doppio sync availability ravvicinato
 *     (es: cron + manual sync nello stesso minuto).
 *   - Se il lock e' gia' tenuto, lo skip silenzioso, perche' significa che un
 *     altro caller sta gia' aggiornando la stessa finestra.
 *
 * Regola SACRA: availability resta source-of-truth dal PMS. Questa utility
 * SOLO anticipa il timing (event-driven), NON cambia la logica del dato.
 */

import { Redis } from "@upstash/redis"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSyncService } from "@/lib/services/scidoo-sync-service"
import { AvailabilityProcessor } from "@/lib/etl/processors/availability-processor"
import { markSyncCompleted } from "./data-freshness"

// Lazy singleton: non istanziare Redis a import-time (Redis.fromEnv legge
// UPSTASH_REDIS_REST_URL/TOKEN). Cosi' `next build` non fallisce quando le
// env mancano in sandbox/preview. Comportamento runtime invariato.
let redisClient: Redis | null = null

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

const LOCK_TTL_SECONDS = 60
const LOCK_KEY_PREFIX = "santaddeo:availability-sync-lock:"

export interface TriggerAvailabilitySyncOptions {
  hotelId: string
  dateFrom: string // YYYY-MM-DD
  dateTo: string // YYYY-MM-DD
  triggeredBy: string // es: "etl-orchestrator:bookings-done", "manual-sync", "cron-sync-modules"
  /**
   * Se true, salta il lock Redis. Usare SOLO per cron schedulati che sono gia'
   * protetti dal proprio debounce. Mai per trigger da UI/webhook.
   */
  bypassLock?: boolean
}

export interface TriggerAvailabilitySyncResult {
  triggered: boolean
  reason?: string
  raw_imported?: number
  etl_inserted?: number
  etl_failed?: number
  duration_ms?: number
}

/**
 * Triggera sync availability + ETL inline per (hotel, range date).
 * Idempotente. Non rilancia errori al caller per non bloccare la pipeline
 * principale (bookings ETL deve sempre completare anche se availability fallisce).
 */
export async function triggerAvailabilitySyncForDates(
  opts: TriggerAvailabilitySyncOptions
): Promise<TriggerAvailabilitySyncResult> {
  const startTime = Date.now()
  const { hotelId, dateFrom, dateTo, triggeredBy, bypassLock = false } = opts

  const lockKey = `${LOCK_KEY_PREFIX}${hotelId}`

  // 1. Lock anti-concorrenza Redis
  if (!bypassLock) {
    try {
      const acquired = await getRedis().set(lockKey, triggeredBy, {
        nx: true,
        ex: LOCK_TTL_SECONDS,
      })
      if (acquired !== "OK") {
        const holder = await getRedis().get(lockKey).catch(() => null)
        console.log(
          `[availability-sync-trigger] hotel=${hotelId} SKIPPED reason=lock_held holder=${holder ?? "?"} triggered_by=${triggeredBy}`
        )
        return { triggered: false, reason: "lock_held" }
      }
    } catch (lockErr) {
      // Se Redis e' irraggiungibile, degrada graceful: log e prosegui senza lock.
      console.warn(
        `[availability-sync-trigger] hotel=${hotelId} redis lock unavailable, proceeding without lock:`,
        lockErr
      )
    }
  }

  console.log(
    `[availability-sync-trigger] hotel=${hotelId} START range=${dateFrom}..${dateTo} triggered_by=${triggeredBy}`
  )

  let rawImported = 0
  let etlInserted = 0
  let etlFailed = 0

  try {
    const supabase = await createServiceRoleClient()

    // 2. Carica integration Scidoo per quell'hotel
    const { data: pmsIntegration } = await supabase
      .from("pms_integrations")
      .select("id, api_key, credentials, pms_name")
      .eq("hotel_id", hotelId)
      .eq("pms_name", "scidoo")
      .eq("is_active", true)
      .maybeSingle()

    const apiKey =
      pmsIntegration?.api_key || (pmsIntegration?.credentials as any)?.api_key
    if (!pmsIntegration || !apiKey) {
      // L'hotel non e' su Scidoo (GSheets/Bedzzle/etc.) — l'event-driven non si
      // applica qui. Restera' la pipeline cron periodica per quegli hotel.
      console.log(
        `[availability-sync-trigger] hotel=${hotelId} SKIPPED reason=no_scidoo_integration`
      )
      return { triggered: false, reason: "no_scidoo_integration" }
    }

    // 3. Sync mirato dal PMS (chiede a Scidoo availability ufficiale per il range)
    const syncResult = await ScidooSyncService.syncAvailability(
      supabase,
      hotelId,
      apiKey,
      dateFrom,
      dateTo
    )
    rawImported = syncResult.imported

    if (syncResult.errors && syncResult.errors.length > 0) {
      console.warn(
        `[availability-sync-trigger] hotel=${hotelId} sync errors:`,
        syncResult.errors.slice(0, 3).join("; ")
      )
    }

    // 4. ETL inline: trasforma scidoo_raw_availability -> daily_availability +
    //    rms_availability_daily. Senza questo step la pagina disponibilita' /
    //    pricing non vedono nulla anche se raw e' stato scritto correttamente.
    //    NOTA: AvailabilityProcessor processa TUTTI i raw `processed=false`,
    //    non solo quelli appena inseriti. Va bene: idempotente, batchato.
    const etlJobIdPlaceholder = `event-driven-${hotelId}-${Date.now()}`
    const processor = new AvailabilityProcessor(hotelId, etlJobIdPlaceholder)
    const etlResult = await processor.process()
    etlInserted = etlResult.records_inserted
    etlFailed = etlResult.records_failed

    // 5. Marca freshness (visibile da /api/dati/freshness)
    await markSyncCompleted(hotelId, "availability").catch((err) => {
      console.warn(
        `[availability-sync-trigger] hotel=${hotelId} markSyncCompleted failed (non-blocking):`,
        err
      )
    })

    // 6. Invalida cache pricing/occupancy se applicabile (opzionale, best-effort)
    try {
      await getRedis().del(`santaddeo:cache:availability:${hotelId}`)
      await getRedis().del(`santaddeo:cache:occupancy:${hotelId}`)
    } catch {
      // Cache invalidation is best-effort
    }

    const duration = Date.now() - startTime
    console.log(
      `[availability-sync-trigger] hotel=${hotelId} DONE raw_imported=${rawImported} etl_inserted=${etlInserted} etl_failed=${etlFailed} duration_ms=${duration}`
    )

    return {
      triggered: true,
      raw_imported: rawImported,
      etl_inserted: etlInserted,
      etl_failed: etlFailed,
      duration_ms: duration,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(
      `[availability-sync-trigger] hotel=${hotelId} ERROR:`,
      errorMessage
    )
    return {
      triggered: false,
      reason: `error: ${errorMessage}`,
      duration_ms: Date.now() - startTime,
    }
  } finally {
    if (!bypassLock) {
      // Rilascia lock subito (anche se TTL lo farebbe scadere comunque dopo 60s).
      // Cosi' il prossimo trigger event-driven puo' partire subito.
      await getRedis().del(lockKey).catch(() => {})
    }
  }
}

/**
 * Helper: emette WARN strutturato se availability per quell'hotel e' piu' vecchia
 * della soglia. Chiamato dal pricing recalc come observability, NON blocca il
 * pricing (regola: warning, non gate).
 */
export async function warnIfAvailabilityStale(
  hotelId: string,
  thresholdMinutes: number = 30
): Promise<void> {
  try {
    const { getDataFreshness } = await import("./data-freshness")
    const freshness = await getDataFreshness(hotelId)
    const ageMinutes = freshness?.availability_age_minutes

    if (ageMinutes != null && ageMinutes > thresholdMinutes) {
      console.warn(
        `[availability-stale] hotel=${hotelId} age_minutes=${ageMinutes} threshold=${thresholdMinutes} pricing_recalc_blocked=false`
      )
    }
  } catch {
    // observability puro, non disturbare la pipeline pricing
  }
}
