import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Helper agnostico per scrivere righe in `sync_logs`.
 *
 * Schema REALE in DB (verificato 20/05/2026 sull'istanza Santaddeo):
 *   hotel_id, sync_type, status, started_at, completed_at,
 *   records_processed, records_failed, error_message, trigger_type,
 *   triggered_by, metadata (jsonb), created_at, id
 *
 * NB: NON esistono colonne `records_inserted`, `records_updated`,
 * `records_fetched`, `duration_ms`, `pms_name`, `pms_integration_id`,
 * `request_params`. Erano state ipotizzate dal codice scidoo precedente
 * ma in produzione sono assenti. I valori semantici equivalenti
 * vengono serializzati in `metadata` (jsonb).
 *
 * `records_processed` viene calcolato come (inserted + updated) quando
 * disponibili, altrimenti `fetched`. Permette al pannello di mostrare
 * un numero significativo senza inventare campi.
 */
export async function logSyncEvent(opts: {
  hotelId: string
  pmsIntegrationId?: string | null
  pmsName: string
  syncType: string
  status: "success" | "partial" | "error"
  startedAt: number
  recordsFetched?: number
  recordsInserted?: number
  recordsUpdated?: number
  recordsFailed?: number
  errorMessage?: string | null
  requestParams?: Record<string, unknown> | null
  triggerType?: string
  /**
   * Metadati extra serializzati in `sync_logs.metadata` (merge a livello root).
   * Usato per i campi del gate di completezza BRiG (`fullSweep`, `complete`,
   * `distinctSeen`, `reportedTotal`, `completenessPasses`) quando il sync e'
   * lanciato manualmente da /api/admin/brig/sync con forceFullSync: senza
   * questi il cron non vedrebbe il marker `fullSweep` e ri-schedulerebbe un
   * altro full sweep. Le chiavi qui hanno precedenza sui default sopra.
   */
  extraMetadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const url =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      ""
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      ""
    if (!url || !key) {
      console.warn("[sync-log] missing supabase env, skip insert")
      return
    }
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const computedProcessed =
      opts.recordsInserted != null || opts.recordsUpdated != null
        ? (opts.recordsInserted ?? 0) + (opts.recordsUpdated ?? 0)
        : opts.recordsFetched ?? 0

    const metadata: Record<string, unknown> = {
      pms_name: opts.pmsName,
      duration_ms: Date.now() - opts.startedAt,
    }
    if (opts.pmsIntegrationId) metadata.pms_integration_id = opts.pmsIntegrationId
    if (opts.recordsFetched != null) metadata.records_fetched = opts.recordsFetched
    if (opts.recordsInserted != null) metadata.records_inserted = opts.recordsInserted
    if (opts.recordsUpdated != null) metadata.records_updated = opts.recordsUpdated
    if (opts.requestParams) metadata.request_params = opts.requestParams
    // Merge dei metadati extra (es. campi del gate di completezza BRiG).
    // Applicato per ultimo: ha precedenza sui default calcolati sopra.
    if (opts.extraMetadata) Object.assign(metadata, opts.extraMetadata)

    // Mappa lo status semantico ai valori accettati dal CHECK constraint
    // `sync_logs_status_check` (verificato 20/05/2026 sull'istanza
    // Santaddeo: in DB esistono solo 'completed', non 'success'). Manteniamo
    // l'API esterna { success | partial | error } pulita semanticamente
    // ma traduciamo prima dell'insert.
    //   success -> completed
    //   partial -> completed_with_errors
    //   error   -> failed
    const statusMap: Record<typeof opts.status, string> = {
      success: "completed",
      partial: "completed_with_errors",
      error: "failed",
    }
    const dbStatus = statusMap[opts.status]

    const row: Record<string, unknown> = {
      hotel_id: opts.hotelId,
      sync_type: opts.syncType,
      status: dbStatus,
      started_at: new Date(opts.startedAt).toISOString(),
      completed_at: new Date().toISOString(),
      records_processed: computedProcessed,
      records_failed: opts.recordsFailed ?? 0,
      error_message: opts.errorMessage ?? null,
      trigger_type: opts.triggerType ?? "manual",
      metadata,
    }

    // Insert con fallback iterativo per PGRST204 (colonna mancante) e per
    // CHECK violation 23514 sullo status: se 'completed_with_errors' non e'
    // tra i valori ammessi su questa istanza, retry con 'completed'.
    let attempt: Record<string, unknown> = row
    const removed: string[] = []
    for (let i = 0; i < 6; i++) {
      const { error } = await supabase.from("sync_logs").insert(attempt)
      if (!error) return

      // CHECK constraint sullo status: degrada a 'completed' o 'failed'.
      if (error.code === "23514" && /sync_logs_status_check/i.test(error.message || "")) {
        const current = attempt.status
        if (current === "completed_with_errors") {
          attempt = { ...attempt, status: "completed" }
          continue
        }
        if (current === "failed") {
          attempt = { ...attempt, status: "error" }
          continue
        }
        console.error("[sync-log] status check violation, no fallback:", error)
        return
      }

      if (error.code !== "PGRST204") {
        console.error("[sync-log] insert error:", error)
        return
      }
      const match = error.message?.match(/'([^']+)' column/i)
      const missing = match?.[1]
      if (!missing || !(missing in attempt)) {
        console.error("[sync-log] insert error after retry:", error)
        return
      }
      const { [missing]: _omit, ...rest } = attempt
      attempt = rest
      removed.push(missing)
    }
    console.error("[sync-log] giving up after stripping columns:", removed.join(", "))
  } catch (err) {
    console.error("[sync-log] unexpected error:", err)
  }
}
