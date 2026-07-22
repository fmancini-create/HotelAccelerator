import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { syncBrigForHotel, reconcileBrigStaleCancellations } from "@/lib/connectors/brig/sync"
import { logSyncEvent } from "@/lib/connectors/sync-log"
import { BrigBookingsProcessor } from "@/lib/etl/processors/brig-bookings-processor"
import { BrigAvailabilityProcessor } from "@/lib/etl/processors/brig-availability-processor"

/**
 * POST /api/admin/brig/sync
 *
 * Lancia un sync Brig manualmente per un hotel. Solo super_admin.
 *
 * Body JSON:
 *   {
 *     "hotelId": "uuid",
 *     "pageSize": 100,            // optional, default 100
 *     "maxPages": 200,            // optional, default 200
 *     "extraFilters": { ... }     // optional, filtri Brig (range date, ecc.)
 *   }
 *
 * Response: BrigSyncResult (vedi lib/connectors/brig/sync.ts).
 */
export async function POST(request: Request) {
  // Auth
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (
    profile?.role !== "super_admin" &&
    profile?.role !== "superadmin"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: {
    hotelId?: string
    pageSize?: number
    maxPages?: number
    extraFilters?: Record<string, unknown>
    /**
     * Forza un full sweep con gate di completezza anti-deriva (vedi
     * lib/connectors/brig/sync.ts). Da usare per il RECUPERO di un hotel la
     * cui disponibilita' non torna (prenotazioni perse per deriva di
     * paginazione, es. Cavallino 01/06/2026). Senza questo l'endpoint faceva
     * solo un incrementale con early-exit a 3 pagine, quindi il gate non
     * girava MAI su richiesta. ATTENZIONE: consuma piu' quota BRiG
     * (~39 pagine per passata).
     */
    forceFullSync?: boolean
    /** Numero massimo di passate del gate di completezza (default 3 in sweep). */
    maxCompletenessPasses?: number
    /**
     * RECUPERO RESUMABILE (FIX 01/06/2026 round 3). Quando true, lo sweep e'
     * budgettato (`maxPagesPerRun` pagine) e riprende dal cursore salvato in
     * pms_integrations.config: ogni click avanza il recupero senza sforare la
     * quota BRiG (100 req/giorno). Da preferire a `forceFullSync` puro su hotel
     * con backlog grande (es. Cavallino).
     */
    resumable?: boolean
    /** Budget pagine per invocazione resumabile (default 12). */
    maxPagesPerRun?: number
    /**
     * FETCH PARTIZIONATO PER DATA (FIX 06/06/2026 — cura definitiva deriva).
     * Scarica le prenotazioni in finestre mensili sul checkin (filtri data BRiG
     * verificati live) invece di paginare la lista globale che si ri-ordina.
     * Elimina la deriva di paginazione alla radice. Riprende da cursore in
     * pms_integrations.config.brigPartitionCursor.
     */
    partitioned?: boolean
    /** Inizio range partizionato (YYYY-MM-DD sul checkin). Default -24 mesi. */
    partitionFrom?: string
    /** Fine range partizionato (YYYY-MM-DD sul checkin). Default +18 mesi. */
    partitionTo?: string
    /** Ampiezza finestra in mesi. Default 1. */
    partitionMonths?: number
    /** Ampiezza finestra in GIORNI (precede partitionMonths). Es. 7 = settimanale. */
    partitionDays?: number
    /**
     * Sweep partizionato EFFIMERO: ignora e non scrive il cursore globale
     * (riparte sempre da partitionFrom). Per refresh near-term manuale senza
     * disturbare il full sweep cursore-based.
     */
    partitionEphemeral?: boolean
    /** Numero max finestre per invocazione. Default 6. */
    maxPartitionsPerRun?: number
    /**
     * Forza la riconciliazione delle cancellazioni stale a fine sync, anche se
     * non e' un full sweep completo. Solo per test/debug manuale. In produzione
     * la riconciliazione gira automaticamente dopo un full sweep completo.
     */
    reconcileStale?: boolean
    /** Override dei giorni di grazia per la riconciliazione (default 7). */
    graceDays?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "invalid_json", hint: "Body JSON malformato" },
      { status: 400 },
    )
  }

  if (!body.hotelId) {
    return NextResponse.json(
      { error: "missing_hotel_id", hint: "hotelId è richiesto" },
      { status: 400 },
    )
  }

  const startedAt = Date.now()
  try {
    const result = await syncBrigForHotel({
      hotelId: body.hotelId,
      pageSize: body.pageSize,
      maxPages: body.maxPages,
      extraFilters: body.extraFilters,
      forceFullSync: body.forceFullSync === true,
      maxCompletenessPasses: body.maxCompletenessPasses,
      resumable: body.resumable === true,
      maxPagesPerRun: body.maxPagesPerRun,
      partitioned: body.partitioned === true,
      partitionFrom: body.partitionFrom,
      partitionTo: body.partitionTo,
      partitionMonths: body.partitionMonths,
      partitionDays: body.partitionDays,
      partitionEphemeral: body.partitionEphemeral === true,
      maxPartitionsPerRun: body.maxPartitionsPerRun,
    })
    await logSyncEvent({
      hotelId: body.hotelId,
      pmsName: "brig",
      syncType: "reservations",
      status: result.ok ? "success" : "partial",
      startedAt,
      recordsFetched: result.totalFetched,
      recordsInserted: result.totalInserted,
      recordsUpdated: result.totalUpdated,
      recordsFailed: result.errors?.length || 0,
      errorMessage: result.errors?.length ? result.errors.join(" | ").slice(0, 1000) : null,
      requestParams: { extraFilters: body.extraFilters, pageSize: body.pageSize },
      // Quando e' un full sweep forzato, scrivi i marker del gate di
      // completezza cosi' il cron (che legge metadata->>fullSweep e ->>complete
      // per decidere il prossimo sweep) vede questo recupero manuale e non
      // ne ri-schedula subito un altro. Allineato all'insert inline del cron.
      extraMetadata: body.forceFullSync || body.resumable || body.partitioned
        ? {
            fullSweep: true,
            complete: result.complete ?? null,
            distinctSeen: result.distinctSeen ?? null,
            reportedTotal: result.reportedTotal ?? null,
            completenessPasses: result.completenessPasses ?? null,
            totalFetched: result.totalFetched,
            totalInserted: result.totalInserted,
            totalUpdated: result.totalUpdated,
            totalUnchanged: result.totalUnchanged,
            pagesFetched: result.pagesFetched,
            // Recupero resumabile: stato del cursore (vedi sync.ts).
            sweepActive: result.sweepActive ?? false,
            sweepNextPage: result.sweepNextPage ?? null,
            dbRowCount: result.dbRowCount ?? null,
            // Fetch partizionato per data (FIX 06/06/2026).
            partitioned: body.partitioned === true,
            partitionsProcessed: result.partitionsProcessed ?? null,
            partitionNextWindowStart: result.partitionNextWindowStart ?? null,
          }
        : null,
    })

    // Riconciliazione cancellazioni stale (FIX 04/06/2026). Gira dopo un full
    // sweep PROVATAMENTE completo, oppure on-demand con `reconcileStale:true`
    // (test). Zero quota BRiG. Vedi reconcileBrigStaleCancellations.
    let staleTombstoned = 0
    const shouldReconcile =
      body.reconcileStale === true ||
      ((body.forceFullSync === true ||
        body.resumable === true ||
        body.partitioned === true) &&
        result.complete === true)
    if (shouldReconcile) {
      try {
        const rec = await reconcileBrigStaleCancellations(body.hotelId, {
          graceDays: body.graceDays,
        })
        staleTombstoned = rec.tombstoned
        console.log(
          `[brig/sync] stale-cancel reconcile hotel=${body.hotelId} ` +
            `candidates=${rec.candidates} tombstoned=${rec.tombstoned} ` +
            `skippedUnsafe=${rec.skippedUnsafe} futureActive=${rec.futureActive}`,
        )
      } catch (e) {
        console.error(
          "[brig/sync] stale-cancel reconcile fallita:",
          e instanceof Error ? e.message : String(e),
        )
      }
    }

    // 20/05/2026: ETL automatico post-sync. Trigger anche su result.ok=false
    // (es. rate limit BRiG 429 a meta' loop) purche' qualche raw sia stato
    // scritto: cosi' i 2200+ record gia' in connectors.brig_raw_bookings
    // vengono normalizzati anche se il sync non ha completato tutte le pagine.
    // ETL e' idempotente (legge processed=false e marca processed=true).
    const totalWritten = (result.totalInserted ?? 0) + (result.totalUpdated ?? 0)
    let etlResult: unknown = null
    let etlError: string | null = null
    if (totalWritten > 0) {
      try {
        const etlJobId = `auto-sync-${Date.now()}`
        const processor = new BrigBookingsProcessor(body.hotelId, etlJobId)
        etlResult = await processor.process()
        await logSyncEvent({
          hotelId: body.hotelId,
          pmsName: "brig",
          syncType: "etl_bookings",
          status: (etlResult as { success?: boolean })?.success ? "success" : "partial",
          startedAt: Date.now() - 1000,
          requestParams: { etlJobId, trigger: "auto-after-sync" },
        })
      } catch (e) {
        etlError = e instanceof Error ? e.message : String(e)
        console.error("[brig/sync] ETL automatico fallito:", etlError)
        await logSyncEvent({
          hotelId: body.hotelId,
          pmsName: "brig",
          syncType: "etl_bookings",
          status: "error",
          startedAt: Date.now() - 1000,
          errorMessage: etlError,
        })
      }
    }

    // Aggiunto 25/05/2026: deriva availability dalle reservations.
    // Brig non espone un endpoint availability dedicato, quindi
    // ricalcoliamo i counter ogni volta che il sync booking porta
    // delle modifiche. Senza questo, dashboard / production /
    // analytics restano con dati obsoleti.
    // FIX 04/06/2026: rideriviamo anche quando la riconciliazione ha
    // tombstonato cancellazioni stale (staleTombstoned>0) senza nuovi record.
    if (totalWritten > 0 || staleTombstoned > 0) {
      try {
        const availJobId = `auto-sync-avail-${Date.now()}`
        const availProcessor = new BrigAvailabilityProcessor(body.hotelId, availJobId)
        const availResult = await availProcessor.process()
        await logSyncEvent({
          hotelId: body.hotelId,
          pmsName: "brig",
          syncType: "etl_availability",
          status: availResult.success ? "success" : "partial",
          startedAt: Date.now() - 1000,
          requestParams: { etlJobId: availJobId, trigger: "auto-after-sync" },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error("[brig/sync] derivazione availability fallita:", msg)
        await logSyncEvent({
          hotelId: body.hotelId,
          pmsName: "brig",
          syncType: "etl_availability",
          status: "error",
          startedAt: Date.now() - 1000,
          errorMessage: msg,
        })
      }
    }

    return NextResponse.json(
      { ...result, etl: etlResult, etlError, staleTombstoned },
      { status: result.ok ? 200 : 207 },
    )
  } catch (e) {
    await logSyncEvent({
      hotelId: body.hotelId,
      pmsName: "brig",
      syncType: "reservations",
      status: "error",
      startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
      requestParams: { extraFilters: body.extraFilters, pageSize: body.pageSize },
    })
    return NextResponse.json(
      {
        error: "sync_failed",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }
}
