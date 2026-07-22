import "server-only"
import { createClient } from "@supabase/supabase-js"
import { SlopeClient, SlopeError, SLOPE_PROD_BASE_URL } from "./client"
import type { SlopeReservation, SlopeReservationExpand } from "./types"

/**
 * Sync Slope per un singolo hotel.
 *
 * Architettura speculare a `lib/connectors/brig/sync.ts` ma MOLTO piu'
 * semplice, perche' la Partner API Slope (a differenza di BRiG) supporta
 * la "Strategia 1" documentata:
 *
 *  1. primo sync SENZA filtri → scarica tutte le prenotazioni
 *  2. sync successivi (polling) con filtro `lastUpdateDate:gt:<cursore>`
 *     → SOLO le prenotazioni create/modificate dopo l'ultimo sync.
 *     Cursore persistito in `pms_integrations.config.slopeLastSyncAt`.
 *  3. periodicamente (una volta al giorno) POST /v1/deleted-resources con
 *     gli id nel nostro storage → marca `is_deleted_on_pms` (hard delete
 *     lato Slope, distinto dalla cancellazione soft `isCanceled`).
 *
 * Upsert idempotente in `connectors.slope_raw_bookings`, chiave naturale
 * (hotel_id, slope_reservation_id). Righe con payload cambiato →
 * processed=false per la rielaborazione ETL.
 *
 * NB niente cursori rotanti/multi-pass/quota-breaker alla BRiG: Slope ha
 * ordinamento stabile, `hasNextPage` affidabile e 30 req/min (≈ 1500
 * prenotazioni/min con 50/pagina). Il retry 429 vive nel client.
 */

export interface SlopeSyncOptions {
  hotelId: string
  /** Forza un full sync ignorando il cursore lastUpdateDate. */
  forceFullSync?: boolean
  /** Esegue anche la riconciliazione deleted-resources (default: auto, 1x/giorno). */
  reconcileDeleted?: boolean
  /** Safety net paginazione. Default 200 pagine (=10.000 prenotazioni/run). */
  maxPages?: number
  /** Sleep tra pagine (ms). Default 300ms (30 req/min → ~2s/req di budget). */
  pageDelayMs?: number
}

export interface SlopeSyncReport {
  hotelId: string
  pagesFetched: number
  recordsExamined: number
  inserted: number
  updated: number
  unchanged: number
  deletedMarked: number
  usedCursor: string | null
  newCursor: string | null
  errors: string[]
}

/** Espansioni richieste a ogni sync: servono al mapper (camera, prezzi, ospite). */
const SYNC_EXPAND: SlopeReservationExpand[] = ["lodgingType", "pricesByDate", "primaryGuest"]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function serviceClient() {
  // Stesso fallback di lib/connectors/brig/sync.ts: in alcuni ambienti
  // (cron/job/script) NEXT_PUBLIC_SUPABASE_URL non e' iniettata.
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://aeynirkfixurikshxfov.supabase.co"
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    throw new Error("syncSlopeForHotel: SUPABASE_SERVICE_ROLE_KEY e' richiesta")
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })
}

/** Costruisce un SlopeClient dalla riga pms_integrations (pms_name='slope'). */
export function slopeClientFromIntegration(pms: {
  api_key?: string | null
  endpoint_url?: string | null
  config?: Record<string, any> | null
}): SlopeClient {
  const baseUrl = pms.endpoint_url || pms.config?.endpoint_url || SLOPE_PROD_BASE_URL
  const apiKey = pms.api_key || pms.config?.api_key || ""
  return new SlopeClient({ baseUrl, apiKey })
}

export async function syncSlopeForHotel(options: SlopeSyncOptions): Promise<SlopeSyncReport> {
  const { hotelId, forceFullSync = false, maxPages = 200, pageDelayMs = 300 } = options
  const supabase = serviceClient()
  const report: SlopeSyncReport = {
    hotelId,
    pagesFetched: 0,
    recordsExamined: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    deletedMarked: 0,
    usedCursor: null,
    newCursor: null,
    errors: [],
  }

  // 1. Integrazione attiva slope per l'hotel
  const { data: pms, error: pmsErr } = await supabase
    .from("pms_integrations")
    .select("id, hotel_id, pms_name, api_key, endpoint_url, config, is_active")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "slope")
    .eq("is_active", true)
    .maybeSingle()
  if (pmsErr || !pms) {
    report.errors.push(pmsErr?.message ?? "Nessuna integrazione Slope attiva per questo hotel")
    return report
  }

  let client: SlopeClient
  try {
    client = slopeClientFromIntegration(pms)
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err))
    return report
  }

  // 2. Cursore incrementale (Strategia 1 doc Slope). Al primo giro e' assente → full sync.
  //    Sanificazione difensiva: cursori storici salvati CON millisecondi
  //    (pre-fix 13/07/2026) vengono troncati al secondo, altrimenti 400.
  const rawCursor: string | null = forceFullSync ? null : (pms.config?.slopeLastSyncAt ?? null)
  const cursor = rawCursor ? rawCursor.replace(/\.\d+(?=Z|[+-])/, "") : null
  report.usedCursor = cursor
  // Il nuovo cursore parte ADESSO (prima delle fetch): eventuali update che
  // arrivano DURANTE il sync verranno ripescati al giro dopo (nessun buco).
  // ATTENZIONE (verificato live in sandbox 13/07/2026): il filtro
  // lastUpdateDate:gt: RIFIUTA i millisecondi ("...T14:20:12.717Z" => 400);
  // accetta solo secondi interi ("...T14:20:12Z"). Troncare SEMPRE.
  const syncStartedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")

  // 3. Paginazione
  // IMPORTANTE (doc Slope): con lastUpdateDate NON si combinano altri filtri.
  const filter = cursor ? [`lastUpdateDate:gt:${cursor}`] : undefined
  let hasNext = true
  for (let page = 1; page <= maxPages && hasNext; page++) {
    let reservations: SlopeReservation[]
    try {
      const res = await client.getReservationsPage({ page, filter, expand: SYNC_EXPAND })
      reservations = res.data
      hasNext = res.pagination.hasNextPage
      report.pagesFetched++
    } catch (err) {
      const msg = err instanceof SlopeError ? `${err.status} ${err.slopeCode ?? err.body.slice(0, 120)}` : String(err)
      report.errors.push(`page ${page}: ${msg}`)
      break
    }

    if (reservations.length === 0) break
    report.recordsExamined += reservations.length

    // Upsert per pagina: leggi le righe esistenti, confronta il payload,
    // scrivi solo cio' che e' nuovo o cambiato (stesso pattern BRiG).
    const ids = reservations.map((r) => r.id)
    const { data: existingRows, error: exErr } = await supabase
      .schema("connectors")
      .from("slope_raw_bookings")
      .select("slope_reservation_id, raw_data")
      .eq("hotel_id", hotelId)
      .in("slope_reservation_id", ids)
    if (exErr) {
      report.errors.push(`select existing page ${page}: ${exErr.message}`)
      break
    }
    const existingById = new Map((existingRows ?? []).map((r: any) => [r.slope_reservation_id, r.raw_data]))

    const toUpsert: any[] = []
    for (const r of reservations) {
      const existing = existingById.get(r.id)
      const nextJson = JSON.stringify(r)
      if (existing !== undefined && JSON.stringify(existing) === nextJson) {
        report.unchanged++
        continue
      }
      if (existing === undefined) report.inserted++
      else report.updated++
      toUpsert.push({
        hotel_id: hotelId,
        pms_integration_id: pms.id,
        slope_reservation_id: r.id,
        checkin: r.stayPeriod?.arrival ?? null,
        checkout: r.stayPeriod?.departure ?? null,
        is_canceled: r.isCanceled === true,
        is_option: r.isOption === true,
        is_overbooking: r.isOverbooking === true,
        sale_source: r.saleSource ?? null,
        lodging_type_id:
          r.lodgingType && typeof r.lodgingType === "object" ? ((r.lodgingType as any).id ?? null) : null,
        adults: r.guestCounts?.adults ?? null,
        children: r.guestCounts?.children ?? null,
        last_update_date: r.lastUpdateDate ?? null,
        raw_data: r,
        synced_at: new Date().toISOString(),
        processed: false,
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
    }

    if (toUpsert.length > 0) {
      const { error: upErr } = await supabase
        .schema("connectors")
        .from("slope_raw_bookings")
        .upsert(toUpsert, { onConflict: "hotel_id,slope_reservation_id" })
      if (upErr) {
        report.errors.push(`upsert page ${page}: ${upErr.message}`)
        break
      }
    }

    if (hasNext && pageDelayMs > 0) await sleep(pageDelayMs)
  }

  // 4. Avanza il cursore SOLO se non ci sono stati errori di fetch/scrittura
  //    (altrimenti al giro dopo ripartiremmo da un cursore che "salta" dati).
  if (report.errors.length === 0) {
    report.newCursor = syncStartedAt
    const newConfig = { ...(pms.config ?? {}), slopeLastSyncAt: syncStartedAt }
    const { error: cfgErr } = await supabase
      .from("pms_integrations")
      .update({ config: newConfig, updated_at: new Date().toISOString() })
      .eq("id", pms.id)
    if (cfgErr) report.errors.push(`cursor update: ${cfgErr.message}`)
  }

  // 5. Riconciliazione hard-delete (max 1 volta/giorno, o forzata).
  const lastDeletedCheck: string | null = pms.config?.slopeDeletedCheckedAt ?? null
  const deletedCheckDue =
    options.reconcileDeleted === true ||
    (options.reconcileDeleted !== false &&
      (!lastDeletedCheck || Date.now() - new Date(lastDeletedCheck).getTime() > 24 * 3600_000))
  if (deletedCheckDue && report.errors.length === 0) {
    try {
      report.deletedMarked = await reconcileSlopeDeleted(supabase, client, hotelId)
      const { data: fresh } = await supabase
        .from("pms_integrations")
        .select("config")
        .eq("id", pms.id)
        .maybeSingle()
      await supabase
        .from("pms_integrations")
        .update({ config: { ...(fresh?.config ?? {}), slopeDeletedCheckedAt: new Date().toISOString() } })
        .eq("id", pms.id)
    } catch (err) {
      report.errors.push(`deleted-resources: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return report
}

/**
 * Chiede a Slope quali reservation id nel nostro storage sono state
 * HARD-DELETED e le marca `is_deleted_on_pms=true` + `processed=false`
 * (l'ETL a valle le trattera' come cancellate). Chunk da 500 id.
 */
async function reconcileSlopeDeleted(
  supabase: ReturnType<typeof serviceClient>,
  client: SlopeClient,
  hotelId: string,
): Promise<number> {
  const allIds: string[] = []
  // Paginazione lato DB (cap 1000 di PostgREST: vedi memoria "1000-row cap").
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .schema("connectors")
      .from("slope_raw_bookings")
      .select("slope_reservation_id")
      .eq("hotel_id", hotelId)
      .eq("is_deleted_on_pms", false)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    allIds.push(...rows.map((r: any) => r.slope_reservation_id))
    if (rows.length < 1000) break
  }
  if (allIds.length === 0) return 0

  let marked = 0
  for (let i = 0; i < allIds.length; i += 500) {
    const chunk = allIds.slice(i, i + 500)
    const deleted = await client.getDeletedResources(chunk, "LODGING_RESERVATIONS")
    if (deleted.length === 0) continue
    const { error } = await supabase
      .schema("connectors")
      .from("slope_raw_bookings")
      .update({
        is_deleted_on_pms: true,
        deleted_checked_at: new Date().toISOString(),
        processed: false,
        updated_at: new Date().toISOString(),
      })
      .eq("hotel_id", hotelId)
      .in("slope_reservation_id", deleted)
    if (error) throw new Error(error.message)
    marked += deleted.length
  }
  return marked
}
