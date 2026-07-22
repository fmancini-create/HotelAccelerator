/**
 * ScidooSyncService - Static adapter for Scidoo sync operations
 * Provides static methods that create ScidooSync instances internally
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/connectors/scidoo/client"
import { MetricsHistoryService } from "./metrics-history-service"
import type { SupabaseClient } from "@supabase/supabase-js"

interface SyncResult {
  imported: number
  errors: string[]
  success?: boolean
}

/**
 * Split a [fromIso, toIso] date range (inclusive, "YYYY-MM-DD") into monthly
 * sub-ranges, each capped at the calendar month boundary. Used to keep
 * Scidoo /invoice/getFiscalProduction.php requests under the server-side
 * timeout that, on ranges > ~30 days, causes 200 OK with empty body
 * (incident 13-16/05/2026, Barronci).
 *
 * Example: ("2026-01-15", "2026-03-10") =>
 *   [
 *     { from: "2026-01-15", to: "2026-01-31" },
 *     { from: "2026-02-01", to: "2026-02-28" },
 *     { from: "2026-03-01", to: "2026-03-10" },
 *   ]
 */
function splitDateRangeByMonth(fromIso: string, toIso: string): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = []
  // Parse as UTC midnight to avoid TZ drift on day boundaries.
  const start = new Date(`${fromIso}T00:00:00Z`)
  const end = new Date(`${toIso}T00:00:00Z`)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [{ from: fromIso, to: toIso }]
  }
  let cursor = new Date(start)
  while (cursor <= end) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth()
    // Last day of current month at UTC.
    const monthEnd = new Date(Date.UTC(year, month + 1, 0))
    const chunkEnd = monthEnd > end ? end : monthEnd
    ranges.push({
      from: cursor.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    })
    // Next chunk starts at day 1 of next month.
    cursor = new Date(Date.UTC(year, month + 1, 1))
  }
  return ranges
}

/**
 * Split a [fromIso, toIso] date range (inclusive) into WEEKLY sub-ranges
 * of `chunkDays` days (default 7). Used by syncFiscalProduction as second
 * layer of safety: even within a single month, Scidoo
 * /invoice/getFiscalProduction.php can return truncated responses (es.
 * marzo Barronci 15/05 22:54: 12 doc su ~500 attesi). Weekly chunking
 * isola il glitch a una sola finestra di 7gg invece di perdere il mese.
 *
 * Esempio: ("2026-03-01","2026-03-31") con chunkDays=7 =>
 *   [01-07, 08-14, 15-21, 22-28, 29-31]
 */
function splitDateRangeByDays(
  fromIso: string,
  toIso: string,
  chunkDays = 7,
): { from: string; to: string }[] {
  const ranges: { from: string; to: string }[] = []
  const start = new Date(`${fromIso}T00:00:00Z`)
  const end = new Date(`${toIso}T00:00:00Z`)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [{ from: fromIso, to: toIso }]
  }
  let cursor = new Date(start)
  while (cursor <= end) {
    const chunkEndDate = new Date(cursor)
    chunkEndDate.setUTCDate(chunkEndDate.getUTCDate() + chunkDays - 1)
    const chunkEnd = chunkEndDate > end ? end : chunkEndDate
    ranges.push({
      from: cursor.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    })
    cursor = new Date(chunkEnd)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return ranges
}

export class ScidooSyncService {
  /**
   * Sync room types from Scidoo
   */
  static async syncRoomTypes(
    hotelId: string,
    pmsIntegrationId: string,
    client: ScidooClient,
    supabase: SupabaseClient
  ): Promise<SyncResult> {
    const errors: string[] = []
    let imported = 0

    try {
      const roomTypes = await client.getRoomTypes()
      console.log("[v0] Scidoo sync: fetched", roomTypes.length, "room types")

      for (const roomType of roomTypes) {
        try {
          const roomCode = roomType.code || roomType.name || String(roomType.id)
          const maxOcc = roomType.capacity || 2
          const { error } = await supabase.from("room_types").upsert(
            {
              hotel_id: hotelId,
              pms_room_type_id: String(roomType.id),
              scidoo_room_type_id: String(roomType.id),
              name: roomType.name,
              code: roomCode,
              capacity: maxOcc,
              capacity_default: roomType.capacity_default || maxOcc,
              min_occupancy: 1,
              max_occupancy: maxOcc,
              total_rooms: roomType.rooms || 1,
              is_active: roomType.active_flag !== false,
            },
            { onConflict: "hotel_id,code" }
          )

          if (error) {
            errors.push(`Room type ${roomType.id}: ${error.message}`)
          } else {
            imported++
          }
        } catch (err) {
          errors.push(`Room type ${roomType.id}: ${err}`)
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch room types: ${error}`)
    }

    return { imported, errors, success: errors.length === 0 }
  }

  /**
   * Sync rates from Scidoo
   */
  static async syncRates(
    hotelId: string,
    pmsIntegrationId: string,
    client: ScidooClient,
    supabase: SupabaseClient
  ): Promise<SyncResult> {
    const errors: string[] = []
    let imported = 0

    try {
      // getRates returns rate plans from /prices/getRates.php
      const today = new Date().toISOString().split("T")[0]
      const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().split("T")[0]
      const rates = await client.getRates(today, nextYear)
      console.log("[v0] Scidoo sync: fetched", rates.length, "rate plans")

      for (const rate of rates) {
        try {
          const { error } = await supabase.from("pms_rate_plans").upsert(
            {
              hotel_id: hotelId,
              pms_integration_id: pmsIntegrationId,
              pms_rate_id: String(rate.id),
              name: rate.name,
              code: rate.code || rate.name,
              is_active: rate.active !== false,
              raw_data: rate,
              synced_at: new Date().toISOString(),
            },
            { onConflict: "hotel_id,pms_rate_id" }
          )

          if (error) {
            errors.push(`Rate ${rate.id}: ${error.message}`)
          } else {
            imported++
          }
        } catch (err) {
          errors.push(`Rate ${rate.id}: ${err}`)
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch rates: ${error}`)
    }

    return { imported, errors, success: errors.length === 0 }
  }

  /**
   * Sync min stay restrictions from Scidoo
   */
  static async syncMinStay(
    supabase: SupabaseClient,
    hotelId: string,
    apiKey: string,
    startDate: string,
    endDate: string
  ): Promise<SyncResult> {
    const errors: string[] = []
    let imported = 0

    try {
      // Get PMS integration to find property_id
      const { data: pmsIntegration } = await supabase
        .from("pms_integrations")
        .select("id, property_id, config")
        .eq("hotel_id", hotelId)
        .eq("pms_name", "scidoo")
        .single()

      if (!pmsIntegration) {
        return { imported: 0, errors: ["PMS integration not found"], success: false }
      }

      const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
      const client = new ScidooClient({ apiKey, propertyId })

      const minstayData = await client.getMinStay(startDate, endDate)
      console.log("[v0] Scidoo sync: fetched", minstayData.length, "minstay records")

      if (minstayData.length === 0) {
        return { imported: 0, errors, success: true }
      }

      // FIX 21/07/2026: prima si scriveva sulla tabella `pms_minstay` che NON
      // esiste (l'upsert non falliva solo perche' il loop era sempre vuoto per
      // il bug di parsing del client, ora risolto -> "fetched 0 minstay records"
      // nonostante Scidoo restituisse i dati). La tabella CANONICA letta dal
      // calendario (/api/calendar) e' `minstay_restrictions`.
      //
      // MODELLO DATI: il calendario consuma il minstay a livello
      // (room_type, date) IGNORANDO il rate (fa .select("date, room_type_id,
      // minstay")). Inoltre il `rate_id` restituito da /rooms/getMinstay.php
      // vive in uno SPAZIO DI ID DIVERSO da `rates.scidoo_rate_id` (che sono i
      // piani tariffari del pricing, es. 95724/256491): il rate_id del minstay
      // (es. 2493) NON e' mappabile ai nostri rate. Quindi:
      //   1) mappiamo solo il room_type (scidoo_room_type_id -> uuid);
      //   2) aggreghiamo per (room_type, date) prendendo il minstay PIU'
      //      RESTRITTIVO (max) e l'OR di cta/ctd tra i rate Scidoo;
      //   3) scriviamo una riga per (room_type, date) con rate_id NULL.
      // Idempotenza: rate_id NULL rompe l'onConflict (in Postgres i NULL sono
      // distinti), quindi usiamo un pattern REPLACE delete-then-insert scoped a
      // (hotel, source='scidoo', range di date sincronizzato).
      const { data: roomTypeRows } = await supabase
        .from("room_types")
        .select("id, scidoo_room_type_id")
        .eq("hotel_id", hotelId)
        .not("scidoo_room_type_id", "is", null)

      const roomTypeMap = new Map<string, string>()
      for (const r of roomTypeRows || []) {
        if (r.scidoo_room_type_id != null) roomTypeMap.set(String(r.scidoo_room_type_id), r.id)
      }

      // Aggregazione per (roomTypeUuid|date).
      const agg = new Map<
        string,
        { room_type_id: string; date: string; minstay: number; cta: boolean; ctd: boolean }
      >()
      let skippedUnmapped = 0

      for (const m of minstayData) {
        const roomTypeUuid = roomTypeMap.get(String(m.room_type_id))
        if (!roomTypeUuid || !m.date) {
          skippedUnmapped++
          continue
        }
        const key = `${roomTypeUuid}|${m.date}`
        const ms = Number.isFinite(m.minstay) ? m.minstay : 0
        const existing = agg.get(key)
        if (existing) {
          existing.minstay = Math.max(existing.minstay, ms) // piu' restrittivo
          existing.cta = existing.cta || !!m.cta
          existing.ctd = existing.ctd || !!m.ctd
        } else {
          agg.set(key, {
            room_type_id: roomTypeUuid,
            date: m.date,
            minstay: ms,
            cta: !!m.cta,
            ctd: !!m.ctd,
          })
        }
      }

      const rows = Array.from(agg.values()).map((r) => ({
        hotel_id: hotelId,
        room_type_id: r.room_type_id,
        rate_id: null as string | null,
        date: r.date,
        minstay: r.minstay,
        cta: r.cta,
        ctd: r.ctd,
        source: "scidoo",
        updated_at: new Date().toISOString(),
      }))

      // REPLACE idempotente: azzera le righe Scidoo del range e reinserisce.
      const { error: delError } = await supabase
        .from("minstay_restrictions")
        .delete()
        .eq("hotel_id", hotelId)
        .eq("source", "scidoo")
        .gte("date", startDate)
        .lte("date", endDate)

      if (delError) {
        errors.push(`MinStay cleanup: ${delError.message}`)
      } else if (rows.length > 0) {
        const { error: insError } = await supabase.from("minstay_restrictions").insert(rows)
        if (insError) {
          errors.push(`MinStay insert: ${insError.message}`)
        } else {
          imported = rows.length
        }
      }

      console.log(
        `[v0] Scidoo sync: ${imported} minstay righe (room_type+date) scritte, ${skippedUnmapped} record Scidoo saltati (room type non mappato)`,
      )
    } catch (error) {
      errors.push(`Failed to fetch minstay: ${error}`)
    }

    return { imported, errors, success: errors.length === 0 }
  }

  /**
   * Sync availability from Scidoo
   */
  static async syncAvailability(
    supabase: SupabaseClient,
    hotelId: string,
    apiKey: string,
    startDate: string,
    endDate: string
  ): Promise<SyncResult> {
    const errors: string[] = []
    let imported = 0

    try {
      const { data: pmsIntegration } = await supabase
        .from("pms_integrations")
        .select("id, property_id, config")
        .eq("hotel_id", hotelId)
        .eq("pms_name", "scidoo")
        .single()

      if (!pmsIntegration) {
        return { imported: 0, errors: ["PMS integration not found"], success: false }
      }

      const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
      // FIX 20/07/2026: cap attesa 429 alzato a 60s + 4 tentativi SOLO per il
      // fetch disponibilita' nel sync. CAUSA RADICE del disallineamento
      // ricorrente (log Barronci 16:00): getAvailability.php su range annuale
      // riceveva 429 "Retry after 50 seconds", ma il client aspettava solo 12s
      // (cap pensato per il push) -> tutti e 3 i tentativi fallivano ->
      // availability:0, fetch fresco MAI riuscito -> daily_availability stale.
      // Qui maxDuration=300 (sync-and-etl) da' ampio budget per rispettare il
      // Retry-After reale di Scidoo.
      const client = new ScidooClient({ apiKey, propertyId, maxRetryWaitMs: 60000, maxAttempts: 4 })

      // getAvailability returns nested structure: [{ room_type_id, availability: [{ date, available_count, occupied_count }] }]
      const rawAvailability = await client.getAvailability(startDate, endDate)
      // Flatten the nested structure into flat records
      const availabilityData: { room_type_id: number; date: string; rooms_available: number; rooms_occupied: number }[] = []
      for (const rt of rawAvailability) {
        for (const day of (rt as any).availability || []) {
          availabilityData.push({
            room_type_id: (rt as any).room_type_id,
            date: day.date,
            rooms_available: day.available_count || 0,
            rooms_occupied: day.occupied_count || 0,
          })
        }
      }
      console.log("[Sync] Scidoo: fetched", availabilityData.length, "availability records from", rawAvailability.length, "room types")

      // FIX CRITICO 12/05/2026 (sera tardi): prima scrivevamo in `pms_availability`
      // che NON ESISTE come tabella in DB (confermato in memorie 06/05). L'upsert
      // falliva silenziosamente ("Could not find the table public.pms_availability"),
      // nessun record veniva inserito in scidoo_raw_availability, l'AvailabilityProcessor
      // non aveva nulla da processare, daily_availability + rms_availability_daily
      // restavano congelate. La pagina disponibilita' / pricing vedeva availability stale.
      //
      // Ora scriviamo in `scidoo_raw_availability` con lo schema atteso dall'ETL
      // (AvailabilityProcessor legge `raw_data.available_count` + `raw_data.occupied_count`
      // dal payload jsonb, vedi lib/etl/processors/availability-processor.ts:128-135).
      const BATCH_SIZE = 500
      const now = new Date().toISOString()
      const allRows = availabilityData.map(avail => ({
        hotel_id: hotelId,
        pms_integration_id: pmsIntegration.id,
        raw_data: {
          available_count: avail.rooms_available,
          occupied_count: avail.rooms_occupied,
          rooms_out_of_service: 0,
          room_type_id: avail.room_type_id,
          date: avail.date,
        },
        scidoo_room_type_id: String(avail.room_type_id),
        date: avail.date,
        rooms_available: avail.rooms_available,
        synced_at: now,
        processed: false,
      }))

      for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        const chunk = allRows.slice(i, i + BATCH_SIZE)
        try {
          const { error } = await supabase.from("scidoo_raw_availability").upsert(
            chunk,
            { onConflict: "hotel_id,scidoo_room_type_id,date" }
          )
          if (error) {
            errors.push(`Availability batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
          } else {
            imported += chunk.length
          }
          console.log(`[Sync] Availability batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Math.min(i + BATCH_SIZE, allRows.length)}/${allRows.length}`)
        } catch (err) {
          errors.push(`Availability batch error: ${err}`)
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch availability: ${error}`)
    }

    return { imported, errors, success: errors.length === 0 }
  }

  /**
   * Sync fiscal production from Scidoo
   */
  static async syncFiscalProduction(
    hotelId: string,
    apiKey: string,
    endpointUrl: string,
    vatNumber: string,
    pmsIntegrationId: string,
    startDate: string,
    endDate: string
  ): Promise<SyncResult> {
    const errors: string[] = []
    let imported = 0

    try {
      const supabase = await createServiceRoleClient()

      const { data: pmsIntegration } = await supabase
        .from("pms_integrations")
        .select("property_id, config")
        .eq("id", pmsIntegrationId)
        .single()

      const propertyId = pmsIntegration?.property_id || (pmsIntegration?.config as any)?.property_id
      const client = new ScidooClient({ apiKey, propertyId, endpointUrl })

      // FIX 16/05/2026 (incident "fiscal silente Barronci dal 13/05"):
      // Scidoo /invoice/getFiscalProduction.php su range > ~30gg risponde
      // 200 con body VUOTO invece di tax_documents popolati (timeout/limit
      // server-side mascherato da 200 OK).
      //
      // FIX 17/05/2026 (incident "marzo Barronci 12 doc su 500 attesi"):
      // Anche su un chunk MENSILE singolo Scidoo puo' restituire response
      // troncata (113k attesi -> 3.6k arrivati). Causa probabile: glitch
      // server-side puntuale o timeout interno del DB Scidoo su quel
      // mese specifico.
      //
      // FIX 18/05/2026 v4 (incident "Barronci gen -30k, mag -466 dopo v3"):
      // Anche il chunking SETTIMANALE e' inaffidabile: Scidoo puo'
      // restituire response PARZIALMENTE popolate (non zero, ma incomplete)
      // che sfuggono al retry-on-zero. Esempio gennaio Barronci: giorni 7,
      // 13, 18 hanno 1-5 doc invece dei ~16/giorno medi = chunk settimanale
      // troncato in cui mancano 30k di doc, ma >0 doc complessivi, quindi
      // nessun retry.
      //
      // Soluzione: chunking DAILY direttamente, no piu' weekly. 150 chiamate
      // da ~150ms = ~25s per range gen-mag, accettabile. Daily chunks sono
      // troppo piccoli per scatenare il timeout interno Scidoo che causa
      // le response parziali. Dedup globale per doc.id resta come safety net.
      // PERF/504 FIX (11/07/2026): la finestra di sync e' condivisa con
      // bookings/availability e si estende ~1 anno nel FUTURO (per le
      // prenotazioni). Ma la produzione fiscale (documenti/fatture GIA' emessi)
      // non puo' esistere per date future: ogni giorno futuro costa una chiamata
      // Scidoo sequenziale (~230ms) che torna sempre "no documents found". Con
      // ~365 giorni futuri = ~80s sprecati per hotel -> spinge il cron oltre
      // maxDuration = 504. Limitiamo l'endDate fiscale a OGGI (UTC). Nessuna
      // perdita dati: il futuro e' genuinamente vuoto lato fiscale.
      const todayUtc = new Date().toISOString().slice(0, 10)
      const fiscalEndDate = endDate > todayUtc ? todayUtc : endDate
      if (fiscalEndDate !== endDate) {
        console.log(
          `[v0] FISCAL SYNC: endDate ${endDate} nel futuro -> limitato a oggi ${fiscalEndDate} (fiscale non ha documenti futuri)`,
        )
      }
      console.log("[v0] FISCAL SYNC: calling getFiscalProduction with", {
        startDate,
        endDate: fiscalEndDate,
        vatNumber,
      })

      const weekRanges =
        startDate > fiscalEndDate ? [] : splitDateRangeByDays(startDate, fiscalEndDate, 1)
      console.log(`[v0] FISCAL SYNC: split into ${weekRanges.length} daily chunks`)

      // Buffer raw arrays, poi dedup per id alla fine.
      const rawAccum: {
        tax_documents: any[]
        fees: any[]
        suspended_invoices: any[]
        deposits: any[]
      } = { tax_documents: [], fees: [], suspended_invoices: [], deposits: [] }

      // Detect "no documents found" pattern (Scidoo throws 400 on truly
      // empty ranges instead of returning 200+[]). Used to short-circuit
      // retries when the empty is real and not a glitch.
      const isEmptyError = (err: any): boolean => {
        const msg = String(err?.message || "")
        return (
          msg.includes("no documents found") ||
          msg.includes("nessun documento") ||
          /\b(400|404)\b.*\bmessage\b/i.test(msg)
        )
      }

      // Helper: fetch un singolo chunk con retry su empty result.
      // Scidoo a volte risponde 200 + body parziale/vuoto (timeout interno
      // mascherato): es. Barronci marzo 12-18 ha avuto 0 doc su 7gg in cui
      // l'hotel ha venduto. Backoff 2000ms perche' 800ms si e' visto non
      // bastare (la cache interna Scidoo dura piu' a lungo).
      const fetchChunkWithRetry = async (
        from: string,
        to: string,
        maxRetries = 2,
        backoffMs = 2000,
      ): Promise<{
        tax_documents: any[]
        fees: any[]
        suspended_invoices: any[]
        deposits: any[]
      } | null> => {
        let lastResp: any = null
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const resp = await client.getFiscalProduction(from, to, vatNumber)
            const total =
              (resp?.tax_documents?.length || 0) +
              (resp?.fees?.length || 0) +
              (resp?.suspended_invoices?.length || 0) +
              (resp?.deposits?.length || 0)
            // Range > 1 giorno con 0 documenti: sospetto per un hotel attivo,
            // riprovo una volta. Range futuro/storico vuoto invece tornera'
            // sempre 0 anche al retry (idempotente).
            if (total === 0 && attempt < maxRetries) {
              const days =
                Math.round(
                  (new Date(`${to}T00:00:00Z`).getTime() -
                    new Date(`${from}T00:00:00Z`).getTime()) /
                    86_400_000,
                ) + 1
              if (days >= 2) {
                console.log(
                  `[v0] FISCAL CHUNK ${from}..${to}: 0 docs on ${days}d range, retrying (attempt ${attempt + 1}/${maxRetries}) after ${backoffMs}ms`,
                )
                await new Promise((r) => setTimeout(r, backoffMs))
                lastResp = resp
                continue
              }
            }
            return resp
          } catch (err) {
            // 400/404 "no documents found" e' GENUINAMENTE vuoto (range
            // futuro o range storico senza vendite). Non riprovare.
            if (isEmptyError(err)) {
              console.log(
                `[v0] FISCAL CHUNK ${from}..${to}: 400 no-documents (genuinely empty), skip retry`,
              )
              return { tax_documents: [], fees: [], suspended_invoices: [], deposits: [] }
            }
            if (attempt >= maxRetries) throw err
            console.log(
              `[v0] FISCAL CHUNK ${from}..${to}: attempt ${attempt} threw, retrying after ${backoffMs}ms`,
              (err as any)?.message,
            )
            await new Promise((r) => setTimeout(r, backoffMs))
          }
        }
        return lastResp
      }

      // FIX 18/05/2026 - Daily-fallback per chunk settimanali persistentemente vuoti:
      // Mar 12-18, Apr 9-15, Mag 7-13 Barronci hanno restituito 0 doc anche
      // al retry (sync-log delle 23:32 15/05). Server glitch persistente >2s.
      // Quando una settimana torna 0 doc dopo retry, falliamo back a 7
      // chunk daily (1 chiamata per giorno). Daily e' ~150ms ciascuno e
      // raramente glitch-a. Se anche un daily torna 0 = giorno vuoto reale.
      // Helper: fetch un range come N chiamate daily (1 chunk per giorno).
      // Daily chunks sono ~150ms/cad e quasi mai glitch-ano vs i weekly
      // che soffrono di cache parziale Scidoo (vedi Barronci v3: gen DB
      // 97k vs UI 127k anche con tutti i giorni presenti — significa che
      // un chunk weekly ha risposto NON-zero ma PARZIALE, scenario non
      // rilevato dal fallback-on-empty).
      const fetchAsDaily = async (
        from: string,
        to: string,
      ): Promise<{
        tax_documents: any[]
        fees: any[]
        suspended_invoices: any[]
        deposits: any[]
      }> => {
        const days = splitDateRangeByDays(from, to, 1)
        const merged = {
          tax_documents: [] as any[],
          fees: [] as any[],
          suspended_invoices: [] as any[],
          deposits: [] as any[],
        }
        for (const day of days) {
          try {
            const dayResp = await fetchChunkWithRetry(day.from, day.to, 1)
            if (dayResp?.tax_documents?.length) merged.tax_documents.push(...dayResp.tax_documents)
            if (dayResp?.fees?.length) merged.fees.push(...dayResp.fees)
            if (dayResp?.suspended_invoices?.length)
              merged.suspended_invoices.push(...dayResp.suspended_invoices)
            if (dayResp?.deposits?.length) merged.deposits.push(...dayResp.deposits)
          } catch (err: any) {
            console.error(`[v0] FISCAL DAILY ${day.from}: ${err?.message || err}`)
            errors.push(`Fiscal daily ${day.from}: ${err?.message || err}`)
          }
        }
        return merged
      }

      const fetchWeekWithDailyFallback = async (
        from: string,
        to: string,
      ): Promise<{
        tax_documents: any[]
        fees: any[]
        suspended_invoices: any[]
        deposits: any[]
        usedDailyFallback: boolean
      }> => {
        // FIX 18/05/2026 v4: per range STORICI (interamente nel passato,
        // to <= today - 7gg) usiamo DIRETTAMENTE chunk daily invece di
        // weekly+fallback. I dati fiscali storici sono immutabili e i
        // weekly chunks soffrono di cache parziale Scidoo: una settimana
        // puo' restituire 30 doc reali invece di 70 SENZA errore (caso
        // Barronci gennaio: 97k vs 127k UI). Daily chunks bypassano
        // questo problema perche' il filtro Scidoo internamente
        // funziona meglio su range giornalieri (~150ms vs >2s).
        //
        // FIX 18/05/2026 v4: forzare daily SEMPRE, anche per maggio
        // (range "recente"). Lo split a livello superiore e' gia' a
        // 1 giorno quindi questa funzione riceve sempre `from===to`
        // e va dritta sul retry. Manteniamo comunque il branch
        // isHistorical per sicurezza se splitDateRangeByDays viene
        // riportato a chunks > 1gg in futuro.
        const today = new Date()
        today.setUTCHours(0, 0, 0, 0)
        const cutoff = new Date(today.getTime() + 7 * 86_400_000) // sempre historical per qualsiasi data <= today+7
        const rangeEnd = new Date(`${to}T00:00:00Z`)
        const isHistorical = rangeEnd < cutoff

        if (isHistorical) {
          // Per range mono-giorno, fetchAsDaily fa una sola chiamata.
          const daily = await fetchAsDaily(from, to)
          const totalDocs =
            daily.tax_documents.length +
            daily.fees.length +
            daily.suspended_invoices.length +
            daily.deposits.length
          if (from === to) {
            // log compatto per singolo giorno (non saturare log su 150 chunks)
            if (totalDocs > 0) {
              console.log(
                `[v0] FISCAL DAY ${from}: tax=${daily.tax_documents.length} fees=${daily.fees.length} sus=${daily.suspended_invoices.length} dep=${daily.deposits.length}`,
              )
            }
          } else {
            console.log(
              `[v0] FISCAL CHUNK ${from}..${to}: HISTORICAL range, fetching as daily chunks (skip weekly)`,
            )
            console.log(
              `[v0] FISCAL CHUNK ${from}..${to}: daily fetch returned tax=${daily.tax_documents.length} fees=${daily.fees.length} sus=${daily.suspended_invoices.length} dep=${daily.deposits.length} (total ${totalDocs})`,
            )
          }
          return { ...daily, usedDailyFallback: true }
        }

        // Future ranges only (oltre today+7): weekly + fallback on empty.
        const weekResp = await fetchChunkWithRetry(from, to)
        const total =
          (weekResp?.tax_documents?.length || 0) +
          (weekResp?.fees?.length || 0) +
          (weekResp?.suspended_invoices?.length || 0) +
          (weekResp?.deposits?.length || 0)
        if (total > 0 || !weekResp) {
          return {
            ...(weekResp || { tax_documents: [], fees: [], suspended_invoices: [], deposits: [] }),
            usedDailyFallback: false,
          }
        }
        // weekly returned 0 docs: split in daily chunks per recuperare.
        const days = splitDateRangeByDays(from, to, 1)
        if (days.length <= 1) {
          return { ...weekResp, usedDailyFallback: false }
        }
        console.log(
          `[v0] FISCAL CHUNK ${from}..${to}: weekly empty after retry, falling back to ${days.length} daily chunks`,
        )
        const merged = await fetchAsDaily(from, to)
        const dailyTotal =
          merged.tax_documents.length +
          merged.fees.length +
          merged.suspended_invoices.length +
          merged.deposits.length
        console.log(
          `[v0] FISCAL DAILY FALLBACK ${from}..${to}: recovered tax=${merged.tax_documents.length} fees=${merged.fees.length} sus=${merged.suspended_invoices.length} dep=${merged.deposits.length} (total ${dailyTotal})`,
        )
        return { ...merged, usedDailyFallback: true }
      }

      for (const [idx, range] of weekRanges.entries()) {
        const t0 = Date.now()
        let chunkResp:
          | {
              tax_documents: any[]
              fees: any[]
              suspended_invoices: any[]
              deposits: any[]
              usedDailyFallback?: boolean
            }
          | null = null
        try {
          chunkResp = await fetchWeekWithDailyFallback(range.from, range.to)
        } catch (err: any) {
          errors.push(`Fiscal chunk ${range.from}..${range.to}: ${err?.message || err}`)
          console.error(
            `[v0] FISCAL CHUNK ${idx + 1}/${weekRanges.length} ${range.from}..${range.to} FAILED:`,
            err?.message || err,
          )
          continue
        }
        const elapsed = Date.now() - t0
        const taxLen = (chunkResp?.tax_documents || []).length
        const feeLen = (chunkResp?.fees || []).length
        const susLen = (chunkResp?.suspended_invoices || []).length
        const depLen = (chunkResp?.deposits || []).length
        console.log(
          `[v0] FISCAL CHUNK ${idx + 1}/${weekRanges.length} ${range.from}..${range.to}: ` +
            `tax=${taxLen} fees=${feeLen} sus=${susLen} dep=${depLen} (${elapsed}ms)`,
        )
        if (chunkResp?.tax_documents?.length) rawAccum.tax_documents.push(...chunkResp.tax_documents)
        if (chunkResp?.fees?.length) rawAccum.fees.push(...chunkResp.fees)
        if (chunkResp?.suspended_invoices?.length)
          rawAccum.suspended_invoices.push(...chunkResp.suspended_invoices)
        if (chunkResp?.deposits?.length) rawAccum.deposits.push(...chunkResp.deposits)
      }

      // Dedup per doc.id all'interno di ciascun array. Scidoo non documenta
      // se il filtro di /getFiscalProduction e' su registration_date o
      // document_date, quindi e' possibile che lo stesso doc.id appaia in
      // due settimane consecutive. Se non dedupliciamo, raddoppieremmo i
      // totali. Tieni la PRIMA occorrenza (fail-safe: ignora versioni piu'
      // recenti, sono in genere identiche per i doc gia' fatturati).
      const dedupById = (arr: any[]) => {
        const seen = new Set<string>()
        const out: any[] = []
        for (const d of arr) {
          const key = String(d?.id ?? `${d?.registration_date}|${d?.document_date}|${d?.total}`)
          if (seen.has(key)) continue
          seen.add(key)
          out.push(d)
        }
        return out
      }
      const fiscalData = {
        tax_documents: dedupById(rawAccum.tax_documents),
        fees: dedupById(rawAccum.fees),
        suspended_invoices: dedupById(rawAccum.suspended_invoices),
        deposits: dedupById(rawAccum.deposits),
      }

      console.log(
        "[v0] FISCAL FETCHED (post-dedup): tax=%d (raw %d), fees=%d (raw %d), sus=%d, dep=%d",
        fiscalData.tax_documents.length,
        rawAccum.tax_documents.length,
        fiscalData.fees.length,
        rawAccum.fees.length,
        fiscalData.suspended_invoices.length,
        fiscalData.deposits.length,
      )

      // Collect all billable documents (invoices + fees).
      // Deposits and suspended_invoices are excluded from fiscal production.
      //
      // FIX 16/05/2026: bucket date = document_date (NON registration_date).
      // Scidoo API e UI filtrano/aggregano per document_date; usare
      // registration_date faceva si' che fatture late-registered finissero
      // in righe DB di mesi successivi al loro mese fiscale, e venivano
      // poi CANCELLATE dai resync incrementali di quei mesi perche' l'API
      // non le restituiva (filtra per document_date). Risultato: regressione
      // dei totali ad ogni resync. Vedi log triage 16/05.
      const allDocs: { bucketDate: string; amount: number }[] = []

      for (const inv of fiscalData.tax_documents || []) {
        const bucketDate = inv.document_date || inv.registration_date
        if (!bucketDate) continue
        allDocs.push({ bucketDate, amount: parseFloat(inv.total) || 0 })
      }
      for (const fee of fiscalData.fees || []) {
        const bucketDate = fee.document_date || fee.registration_date
        if (!bucketDate) continue
        allDocs.push({ bucketDate, amount: parseFloat(fee.taxable) || 0 })
      }

      console.log("[v0] FISCAL allDocs collected:", allDocs.length)
      console.log("[Sync] Scidoo fiscal: fetched",
        (fiscalData.tax_documents || []).length, "invoices,",
        (fiscalData.fees || []).length, "fees ->",
        allDocs.length, "billable documents"
      )

      // Aggregate by document_date (bucket date)
      const dailyTotals = new Map<string, number>()
      for (const doc of allDocs) {
        const current = dailyTotals.get(doc.bucketDate) || 0
        dailyTotals.set(doc.bucketDate, current + doc.amount)
      }

      console.log("[Sync] Scidoo fiscal: aggregated into", dailyTotals.size, "daily records")

      // Get hotel total_rooms for daily_production insert
      const { data: hotelData } = await supabase
        .from("hotels")
        .select("total_rooms")
        .eq("id", hotelId)
        .maybeSingle()
      const totalRooms = hotelData?.total_rooms || 0

      // FIX 16/05/2026: DELETE pre-insert per il range del sync.
      // Cancella le righe esistenti del hotel per source='scidoo_fiscal' nel
      // range richiesto, sia in daily_production che in
      // connectors.scidoo_raw_fiscal_production. Necessario perche':
      // 1) la chiave riga e' stata cambiata da registration_date a
      //    document_date: senza pulizia, vecchie righe basate su
      //    registration_date restano orphan e causano double-count;
      // 2) un giorno che PRIMA aveva fatturato e ORA non ne ha piu' (es.
      //    documento annullato o spostato) deve effettivamente azzerarsi
      //    invece di mantenere il valore vecchio.
      //
      // Sicuro: il range eliminato e' esattamente quello che il sync sta
      // per riempire con dati freschi.
      try {
        const { error: delDp } = await supabase
          .from("daily_production")
          .delete()
          .eq("hotel_id", hotelId)
          .eq("source", "scidoo_fiscal")
          .gte("date", startDate)
          .lte("date", endDate)
        if (delDp) {
          errors.push(`Pre-insert delete daily_production: ${delDp.message}`)
        }
        const { error: delRaw } = await supabase.rpc("exec_sql", {
          query: `DELETE FROM connectors.scidoo_raw_fiscal_production WHERE hotel_id='${hotelId}' AND date >= '${startDate}' AND date <= '${endDate}'`,
        })
        if (delRaw) {
          errors.push(`Pre-insert delete raw fiscal: ${delRaw.message}`)
        }
        console.log(
          `[v0] FISCAL pre-insert cleanup: deleted rows in [${startDate}..${endDate}] for hotel ${hotelId}`,
        )
      } catch (cleanupErr) {
        console.error("[v0] FISCAL pre-insert cleanup exception:", cleanupErr)
        errors.push(`Pre-insert cleanup: ${cleanupErr}`)
      }

      // Batch upsert daily_production
      const now = new Date().toISOString()
      const prodRows = Array.from(dailyTotals.entries()).map(([date, totalRevenue]) => ({
        hotel_id: hotelId,
        date,
        total_revenue: totalRevenue,
        total_rooms: totalRooms,
        rooms_occupied: 0,
        rooms_available: totalRooms,
        source: "scidoo_fiscal",
        calculated_at: now,
        updated_at: now,
      }))

      const PROD_BATCH = 500
      for (let i = 0; i < prodRows.length; i += PROD_BATCH) {
        const chunk = prodRows.slice(i, i + PROD_BATCH)
        try {
          const { error } = await supabase.from("daily_production").upsert(
            chunk,
            { onConflict: "hotel_id,date" }
          )
          if (error) {
            errors.push(`Production batch ${Math.floor(i / PROD_BATCH) + 1}: ${error.message}`)
          } else {
            imported += chunk.length
          }
        } catch (err) {
          errors.push(`Production batch error: ${err}`)
        }
      }

      // Also write raw documents to connectors.scidoo_raw_fiscal_production
      // so the dashboard route can read detailed breakdowns.
      console.log("[v0] FISCAL: Starting insert to connectors.scidoo_raw_fiscal_production")
      try {
        // Group raw documents by registration_date for the connectors table
        const rawByDate = new Map<string, any[]>()
        const allRawDocs = [
          ...(fiscalData.tax_documents || []).map((d: any) => ({ ...d, type: "invoice" })),
          ...(fiscalData.fees || []).map((d: any) => ({ ...d, type: "fee" })),
          ...(fiscalData.suspended_invoices || []).map((d: any) => ({ ...d, type: "suspended_invoice" })),
          ...(fiscalData.deposits || []).map((d: any) => ({ ...d, type: "deposit" })),
        ]
        console.log("[v0] FISCAL allRawDocs total:", allRawDocs.length)
        
        // FIX 16/05/2026: chiave riga = document_date (NON registration_date).
        // Vedi commento in syncFiscalProduction sopra.
        for (const doc of allRawDocs) {
          const bucketDate = doc.document_date || doc.registration_date
          if (!bucketDate) continue
          if (!rawByDate.has(bucketDate)) rawByDate.set(bucketDate, [])
          rawByDate.get(bucketDate)!.push(doc)
        }

        console.log("[v0] INSERT RAW FISCAL: rawByDate.size =", rawByDate.size, "dates to insert")
        
        let insertedCount = 0
        let insertErrors: string[] = []
        
        for (const [date, docs] of rawByDate) {
          const totalRevenue = docs
            .filter((d: any) => d.type === "invoice" || d.type === "fee")
            .reduce((sum: number, d: any) => sum + (parseFloat(d.total || d.taxable) || 0), 0)

          // Use raw SQL via exec_sql RPC to insert into connectors schema
          const rawData = {
            documents: docs,
            total_revenue: totalRevenue,
            invoices_count: docs.filter((d: any) => d.type === "invoice").length,
            fees_count: docs.filter((d: any) => d.type === "fee").length,
            deposits_count: docs.filter((d: any) => d.type === "deposit").length,
            suspended_count: docs.filter((d: any) => d.type === "suspended_invoice").length,
            sync_period: { from: startDate, to: endDate },
          }
          
          const sqlQuery = `
            INSERT INTO connectors.scidoo_raw_fiscal_production (
              hotel_id, pms_integration_id, date, total_revenue, raw_data, synced_at
            ) VALUES (
              '${hotelId}',
              '${pmsIntegrationId}',
              '${date}',
              ${totalRevenue},
              '${JSON.stringify(rawData).replace(/'/g, "''")}'::jsonb,
              '${new Date().toISOString()}'
            )
            ON CONFLICT (hotel_id, date) DO UPDATE SET
              total_revenue = ${totalRevenue},
              raw_data = '${JSON.stringify(rawData).replace(/'/g, "''")}'::jsonb,
              synced_at = '${new Date().toISOString()}'
          `
          
          const { error } = await supabase.rpc("exec_sql", { query: sqlQuery })
          
          if (error) {
            console.error("[v0] FISCAL INSERT ERROR for date", date, ":", error.message)
            insertErrors.push(`${date}: ${error.message}`)
          } else {
            insertedCount++
          }
        }
        console.log("[v0] FISCAL INSERTED:", insertedCount, "rows to connectors.scidoo_raw_fiscal_production")
        if (insertErrors.length > 0) {
          console.error("[v0] FISCAL INSERT ERRORS:", insertErrors.length, "errors:", insertErrors.slice(0, 5))
        }
        console.log("[Sync] Scidoo fiscal: wrote", rawByDate.size, "rows to connectors.scidoo_raw_fiscal_production")
      } catch (rawErr) {
        console.error("[v0] FISCAL: Exception in connectors insert block:", rawErr)
        console.error("[Sync] Scidoo fiscal: failed to write to connectors table:", rawErr)
        // Non-fatal: daily_production was already written
      }
    } catch (error) {
      errors.push(`Failed to fetch fiscal production: ${error}`)
    }

    return { imported, errors, success: errors.length === 0 }
  }

  /**
   * Sync bookings from Scidoo (incremental or full)
   */
  static async syncBookings(
    supabase: SupabaseClient,
    hotelId: string,
    apiKey: string,
    startDate: string,
    endDate: string,
    isInitialSync: boolean = false
  ): Promise<SyncResult> {
    const errors: string[] = []
    let imported = 0

    try {
      const { data: pmsIntegration } = await supabase
        .from("pms_integrations")
        .select("id, property_id, config")
        .eq("hotel_id", hotelId)
        .eq("pms_name", "scidoo")
        .single()

      if (!pmsIntegration) {
        return { imported: 0, errors: ["PMS integration not found"], success: false }
      }

      const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
      const client = new ScidooClient({ apiKey, propertyId })

    // Use modified_from for incremental sync (more reliable than last_modified flag)
    // last_modified is session-based and unreliable across different sync runs
    let bookingsResult
    if (isInitialSync) {
      // Chunk by quarter using stay_from/stay_to to capture ALL bookings
      // with nights in each period (including cross-period bookings).
      // stay_from/stay_to filters by stay dates, not checkin date, so a booking
      // with checkin in December and checkout in January is captured in both chunks.
      console.log("[Sync] Initial sync: fetching bookings in quarterly chunks (stay_from/stay_to) from", startDate, "to", endDate)
      const seenIds = new Set<string>()
      const allReservations: any[] = []
      const start = new Date(startDate)
      const end = new Date(endDate)
      let chunkStart = new Date(start)
      while (chunkStart < end) {
        const chunkEnd = new Date(chunkStart)
        chunkEnd.setMonth(chunkEnd.getMonth() + 3) // 3-month chunks
        if (chunkEnd > end) chunkEnd.setTime(end.getTime())
        const chunkStartStr = chunkStart.toISOString().split("T")[0]
        const chunkEndStr = chunkEnd.toISOString().split("T")[0]
        console.log(`[Sync] Chunk: ${chunkStartStr} -> ${chunkEndStr}`)
        try {
          const chunkResult = await client.getBookings({ stay_from: chunkStartStr, stay_to: chunkEndStr })
          const chunkBookings = chunkResult.reservations || []
          console.log(`[Sync] Chunk ${chunkStartStr}: ${chunkBookings.length} bookings`)
          // Deduplicate across chunks using max internal_id strategy.
          // Scidoo returns multiple versions of the same booking_id (historical cancelled +
          // current active). internal_id is a global auto-increment: higher = more recent.
          // We always keep the version with the highest internal_id.
          for (const b of chunkBookings) {
            const id = String(b.id || b.internal_id)
            const newInternalId = parseInt(String(b.internal_id || '0'), 10)
            if (!seenIds.has(id)) {
              seenIds.add(id)
              allReservations.push(b)
            } else {
              const existingIdx = allReservations.findIndex(
                (r: any) => String(r.id || r.internal_id) === id
              )
              if (existingIdx !== -1) {
                const existingInternalId = parseInt(String(allReservations[existingIdx].internal_id || '0'), 10)
                if (newInternalId > existingInternalId) {
                  const existingStatus: string = allReservations[existingIdx].status || ''
                  const newStatus: string = b.status || ''
                  // WARN: legitimate cancellation overwriting an active booking version
                  if (['check_in', 'confermata', 'saldo'].includes(existingStatus) && newStatus === 'annullata') {
                    console.warn(`[Sync] WARN: booking ${id} cancellato nel PMS — ${existingStatus} → annullata (internal_id ${existingInternalId} → ${newInternalId})`)
                  }
                  // INFO: zombie corrected — active version overwriting a cancelled one
                  if (existingStatus === 'annullata' && newStatus !== 'annullata') {
                    console.log(`[Sync] INFO: booking ${id} riattivato — annullata → ${newStatus} (internal_id ${existingInternalId} → ${newInternalId})`)
                  }
                  allReservations[existingIdx] = b
                } else if (newInternalId < existingInternalId) {
                  // INFO (downgraded 18/05/2026): chunk overlap o
                  // `last_modified=true` ha ritornato uno snapshot piu' vecchio
                  // dello stesso booking. La logica max-internal_id scarta il
                  // vecchio: comportamento corretto. ~50/giorno costanti su
                  // Barronci (es. booking 30868 ogni 20min). Il dedup-final
                  // resta warn perche' li' sarebbe davvero anomalo.
                  console.log(`[Sync] dedup: booking ${id} skip stale snapshot (existing internal_id ${existingInternalId} > incoming ${newInternalId}, gap ${existingInternalId - newInternalId})`)
                }
                // equal internal_id: same version arriving from multiple chunks, keep existing silently
              }
            }
          }
        } catch (chunkErr: any) {
          console.error(`[Sync] Chunk ${chunkStartStr} failed: ${chunkErr.message}`)
          errors.push(`Chunk ${chunkStartStr}: ${chunkErr.message}`)
        }
        chunkStart = new Date(chunkEnd)
        chunkStart.setDate(chunkStart.getDate() + 1)
      }
      bookingsResult = { count: allReservations.length, reservations: allReservations }
    } else {
      // Incremental sync strategy (FIX 30/04/2026 v3 — post-incident "no bookings today"):
      // Strategy:
      // 1) `modified_from = today - 14 days`: filtro DETERMINISTICO per data
      //    di ultima modifica. Pesca tutte le prenotazioni (incluse le NUOVE
      //    di oggi) modificate negli ultimi 14 giorni.
      // 2) `stay_from/to`: cattura prenotazioni con stay nel range che non
      //    sono state modificate ma vogliamo comunque rinfrescare.
      // PERCHE' NON `last_modified: true`: il flag `last_modified` di Scidoo
      // e' SESSION-BASED. La prima chiamata dopo l'apertura sessione ritorna
      // un grosso payload "tutto cio' che e' stato modificato dall'apertura",
      // ma le chiamate successive non si aggiornano in modo affidabile per
      // record creati piu' recentemente. Risultato: lo stesso snapshot di
      // ~6320 record ritornato in loop, le prenotazioni nuove di oggi non
      // entrano mai. Sintomo verificato 30/04/2026: ID max in DB 30658
      // (29/04 16:57), ma utente Barronci confermava nuove prenotazioni
      // arrivate il 30/04. Il fix usa `modified_from` che e' un filtro
      // deterministico per timestamp, immune al bug di sessione.
      const incrementalLookbackDays = 14
      const modifiedFrom = new Date()
      modifiedFrom.setDate(modifiedFrom.getDate() - incrementalLookbackDays)
      const modifiedFromStr = modifiedFrom.toISOString().split("T")[0]

      console.log(
        "[Sync] Incremental sync: modified_from=",
        modifiedFromStr,
        "+ stay from",
        startDate,
        "to",
        endDate,
      )

      const [stayResult, modifiedResult] = await Promise.all([
        client.getBookings({ stay_from: startDate, stay_to: endDate }),
        client.getBookings({ modified_from: modifiedFromStr }),
      ])
      
      // Merge results, deduplicating by booking ID using max internal_id strategy.
      // Scidoo returns multiple versions of the same booking_id; the version with the
      // highest internal_id is the most recent and authoritative one.
      const mergedMap = new Map<string, any>()
      for (const b of [...(stayResult.reservations || []), ...(modifiedResult.reservations || [])]) {
        const key = String(b.id || b.internal_id)
        const newInternalId = parseInt(String(b.internal_id || '0'), 10)
        const existing = mergedMap.get(key)
        if (!existing) {
          mergedMap.set(key, b)
        } else {
          const existingInternalId = parseInt(String(existing.internal_id || '0'), 10)
          if (newInternalId > existingInternalId) {
            const existingStatus: string = existing.status || ''
            const newStatus: string = b.status || ''
            if (['check_in', 'confermata', 'saldo'].includes(existingStatus) && newStatus === 'annullata') {
              console.warn(`[Sync] WARN: booking ${key} cancellato nel PMS — ${existingStatus} → annullata (internal_id ${existingInternalId} → ${newInternalId})`)
            }
            if (existingStatus === 'annullata' && newStatus !== 'annullata') {
              console.log(`[Sync] INFO: booking ${key} riattivato — annullata → ${newStatus} (internal_id ${existingInternalId} → ${newInternalId})`)
            }
            mergedMap.set(key, b)
          } else if (newInternalId < existingInternalId) {
            // INFO (downgraded 18/05/2026): vedi commento dedup pass 1.
            console.log(`[Sync] dedup: booking ${key} skip stale snapshot (existing internal_id ${existingInternalId} > incoming ${newInternalId}, gap ${existingInternalId - newInternalId})`)
          }
        }
      }
      bookingsResult = { count: mergedMap.size, reservations: Array.from(mergedMap.values()) }
    }
    const bookings = bookingsResult.reservations || []

    console.log("[Sync] Fetched", bookings.length, "bookings from Scidoo", isInitialSync ? "(initial)" : "(incremental from date range)")

      // Final dedup pass using max internal_id strategy (catches any duplicates that
      // slipped through the earlier merge steps, e.g. same booking_id appearing in both
      // stay_from/to and last_modified responses with different internal_ids).
      const uniqueBookings = new Map()
      for (const booking of bookings) {
        const key = String(booking.id || booking.internal_id)
        const newInternalId = parseInt(String(booking.internal_id || '0'), 10)
        const existing = uniqueBookings.get(key)
        if (!existing) {
          uniqueBookings.set(key, booking)
        } else {
          const existingInternalId = parseInt(String(existing.internal_id || '0'), 10)
          if (newInternalId > existingInternalId) {
            const existingStatus: string = existing.status || ''
            const newStatus: string = booking.status || ''
            if (['check_in', 'confermata', 'saldo'].includes(existingStatus) && newStatus === 'annullata') {
              console.warn(`[Sync] WARN: booking ${key} cancellato nel PMS — ${existingStatus} → annullata (internal_id ${existingInternalId} → ${newInternalId})`)
            }
            if (existingStatus === 'annullata' && newStatus !== 'annullata') {
              console.log(`[Sync] INFO: booking ${key} riattivato — annullata → ${newStatus} (internal_id ${existingInternalId} → ${newInternalId})`)
            }
            uniqueBookings.set(key, booking)
          } else if (newInternalId < existingInternalId) {
            // Final dedup pass: stesso comportamento dei pass precedenti.
            // Downgrade da error a warn, vedi commento sopra.
            console.warn(`[Sync] dedup-final: booking ${key} skip stale snapshot (existing internal_id ${existingInternalId} > incoming ${newInternalId}, gap ${existingInternalId - newInternalId})`)
          }
        }
      }
      console.log("[Sync] Deduplicated:", bookings.length, "->", uniqueBookings.size, "unique bookings")

      // Import to scidoo_raw_bookings
      // Filter out bookings without valid checkin_date (required NOT NULL column)
      const allBookings = Array.from(uniqueBookings.values())
      const isValidDate = (d: any): boolean => {
        if (!d || d === "null" || d === "0000-00-00") return false
        const parsed = new Date(d)
        return !isNaN(parsed.getTime())
      }
      const bookingsArray = allBookings.filter((b: any) => isValidDate(b.checkin_date))
      const skippedCount = allBookings.length - bookingsArray.length
      if (skippedCount > 0) {
        const skippedSample = allBookings.filter((b: any) => !isValidDate(b.checkin_date)).slice(0, 3)
        console.log(`[v0] Skipped ${skippedCount} bookings without valid checkin_date. Sample values:`, skippedSample.map((b: any) => ({ id: b.id, checkin_date: b.checkin_date, status: b.status })))
      }
      // Build scidoo_room_type_id -> room_type_name lookup
      const { data: roomTypesForLookup } = await supabase
        .from("room_types")
        .select("name,scidoo_room_type_id")
        .eq("hotel_id", hotelId)
      const scidooRtIdToName: Record<string, string> = {}
      for (const rt of roomTypesForLookup || []) {
        if (rt.scidoo_room_type_id) scidooRtIdToName[String(rt.scidoo_room_type_id)] = rt.name
      }

      // Try to derive checkin_date/checkout_date from daily_price keys when missing
      // stay_from/stay_to may return bookings without checkin_date but WITH daily_price
      for (const b of bookingsArray) {
        if (!isValidDate(b.checkin_date) && b.daily_price && typeof b.daily_price === "object") {
          const dpKeys = Object.keys(b.daily_price)
          if (dpKeys.length > 0) {
            // Parse dates from daily_price keys (format: "YYYY-MM-DD" or "DD/MM/YYYY")
            const parsedDates = dpKeys.map((k: string) => {
              if (k.includes("/")) {
                const [dd, mm, yyyy] = k.split("/")
                return `${yyyy}-${mm}-${dd}`
              }
              return k
            }).filter((d: string) => isValidDate(d)).sort()
            
            if (parsedDates.length > 0) {
              b.checkin_date = parsedDates[0]
              // checkout = last daily_price date + 1 day
              const lastDate = new Date(parsedDates[parsedDates.length - 1])
              lastDate.setDate(lastDate.getDate() + 1)
              b.checkout_date = lastDate.toISOString().slice(0, 10)
              console.log(`[Sync] Derived dates for booking ${b.id || b.internal_id}: ${b.checkin_date} → ${b.checkout_date} from daily_price keys`)
            }
          }
        }
      }

      // Filter out bookings that STILL have no valid checkin_date after derivation
      const validBookings = bookingsArray.filter((b: any) => {
        if (!isValidDate(b.checkin_date)) {
          console.log(`[Sync] Skipping booking ${b.id || b.internal_id}: no valid checkin_date and no daily_price to derive from`)
          return false
        }
        return true
      })
      const skippedRaw = bookingsArray.length - validBookings.length
      if (skippedRaw > 0) {
        console.log(`[Sync] Filtered out ${skippedRaw} bookings without valid checkin_date`)
      }

      // Pre-load existing raw bookings to detect status/room_type downgrades
      // This prevents Scidoo from overwriting good data with incomplete updates
      const existingBookingsMap = new Map<string, { status: string; room_type_name: string | null; room_type_code: string | null }>()
      const bookingIds = validBookings.map((b: any) => String(b.id || b.internal_id))
      for (let i = 0; i < bookingIds.length; i += 500) {
        const chunk = bookingIds.slice(i, i + 500)
        const { data: existing } = await supabase
          .from("scidoo_raw_bookings")
          .select("scidoo_booking_id, status, room_type_name, room_type_code")
          .eq("hotel_id", hotelId)
          .in("scidoo_booking_id", chunk)
        for (const row of existing || []) {
          existingBookingsMap.set(row.scidoo_booking_id, row)
        }
      }
      console.log("[Sync] Pre-loaded", existingBookingsMap.size, "existing bookings for downgrade protection")

      const batchSize = 100

      for (let i = 0; i < validBookings.length; i += batchSize) {
        const batch = validBookings.slice(i, i + batchSize)

        const records = batch.map((booking: any) => {
          // Calculate total_amount from daily_price (room revenue only, no extras)
          let roomTotal = 0
          if (booking.daily_price && typeof booking.daily_price === "object") {
            roomTotal = Object.values(booking.daily_price).reduce((sum: number, v: any) => sum + (parseFloat(v) || 0), 0)
          }
          const channel = booking.agency?.name || "Direct"

          // Ensure checkout_date is valid, fallback to checkin_date + 1 day
          let checkoutDate = booking.checkout_date
          if (!isValidDate(checkoutDate)) {
            const ci = new Date(booking.checkin_date)
            ci.setDate(ci.getDate() + 1)
            checkoutDate = ci.toISOString().slice(0, 10)
          }

          // --- Downgrade protection (room_type only) ---
          // FIX 1 (2026-04): Status downgrade protection removed.
          // Scidoo raw_data.status is the source of truth — always use it as-is.
          // Previously, bookings with raw_data.status="annullata" were incorrectly
          // promoted to "confermata" if daily_price > 0 (phantom revenue inflation).
          // The only protection kept is for room_type_code="0", which is a PMS
          // data quality issue unrelated to cancellation logic.
          const scidooId = String(booking.id || booking.internal_id)
          const existing = existingBookingsMap.get(scidooId)

          const effectiveStatus = booking.status
          let effectiveRoomTypeName = booking.room_type_name || booking.room_type || scidooRtIdToName[String(booking.room_type_id)] || null
          let effectiveRoomTypeCode = booking.room_type_id ? String(booking.room_type_id) : null

          if (existing) {
            // Protect room_type only: if PMS sends "0" or null but we already have a
            // real value, keep it. This prevents losing room type on incremental syncs
            // where Scidoo occasionally sends incomplete room_type_id for active bookings.
            const incomingCodeIsMissing = !effectiveRoomTypeCode || effectiveRoomTypeCode === "0"
            if (incomingCodeIsMissing && existing.room_type_code && existing.room_type_code !== "0") {
              effectiveRoomTypeName = existing.room_type_name
              effectiveRoomTypeCode = existing.room_type_code
            }
          }

          return {
            hotel_id: hotelId,
            pms_integration_id: pmsIntegration.id,
            scidoo_booking_id: scidooId,
            pms_booking_id: scidooId,
            raw_data: booking,
            checkin_date: booking.checkin_date,
            checkout_date: checkoutDate,
            status: effectiveStatus,
            room_type_name: effectiveRoomTypeName,
            room_type_code: effectiveRoomTypeCode,
            total_amount: roomTotal || null,
            channel: channel,
            rate_code: booking.rate_id ? String(booking.rate_id) : null,
            rate_name: booking.rate_name || null,
            guests_count: parseInt(booking.guest_count) || booking.guests?.length || null,
            adults_count: parseInt(booking.adult_count) || null,
            children_count: parseInt(booking.child_count) || null,
            customer_first_name: booking.customer?.first_name || null,
            customer_last_name: booking.customer?.last_name || null,
            customer_email: booking.customer?.email || null,
            customer_country: booking.customer?.citizenship || null,
            booking_date: booking.creation || null,
            cancellation_date: booking.cancellation || null,
            synced_at: new Date().toISOString(),
          }
        })

        // FIX 30/04/2026 + 16/05/2026 (post-incident Barronci 82 errori/h):
        // Defense-in-depth multi-step:
        //  1. Filter records con checkin_date invalido (already filtered
        //     upstream via validBookings, ma cintura+bretelle).
        //  2. NORMALIZE checkin_date a stringa "YYYY-MM-DD" (Postgres date)
        //     PRIMA dell'upsert, per evitare che valori Date-object / formati
        //     ISO-with-time / serializzazioni JSON che producano undefined →
        //     null colpiscano il NOT NULL constraint.
        //  3. checkout_date stesso trattamento ma con fallback checkin+1.
        // Sintomo originale: "Batch 1..82: null value in column checkin_date"
        // (Barronci, persi 8200 record/cron run pur avendo il filter base).
        const toIsoDate = (v: any): string | null => {
          if (!v) return null
          if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
          const d = new Date(v)
          if (isNaN(d.getTime())) return null
          return d.toISOString().slice(0, 10)
        }
        let normalizationSkipped = 0
        const safeRecords = records
          .map((r: any) => {
            const ciIso = toIsoDate(r.checkin_date)
            if (!ciIso) {
              normalizationSkipped++
              return null
            }
            let coIso = toIsoDate(r.checkout_date)
            if (!coIso) {
              // Fallback: checkout = checkin + 1 day
              const co = new Date(ciIso)
              co.setUTCDate(co.getUTCDate() + 1)
              coIso = co.toISOString().slice(0, 10)
            }
            return { ...r, checkin_date: ciIso, checkout_date: coIso }
          })
          .filter((r: any) => r !== null) as any[]

        if (normalizationSkipped > 0) {
          console.warn(
            `[Sync] Batch ${Math.floor(i / batchSize) + 1}: normalized away ${normalizationSkipped}/${records.length} records ` +
              `(checkin_date unparseable). Sample raw values:`,
            records
              .filter((r: any) => toIsoDate(r.checkin_date) === null)
              .slice(0, 3)
              .map((r: any) => ({ id: r.scidoo_booking_id, ci: r.checkin_date, type: typeof r.checkin_date })),
          )
        }

        if (safeRecords.length === 0) {
          console.log(`[v0] Batch ${Math.floor(i / batchSize) + 1}: skipped (all ${records.length} records had invalid checkin_date)`)
          continue
        }

        // FIX 15/07/2026 (deadlock detected nei log): ordinamento
        // DETERMINISTICO per chiave di conflitto. Due run concorrenti che
        // upsertano righe sovrapposte in ordine diverso acquisiscono i lock
        // di riga in ordine incrociato -> deadlock. Con lo stesso ordine il
        // secondo run attende invece di andare in stallo.
        safeRecords.sort((a: any, b: any) =>
          String(a.scidoo_booking_id).localeCompare(String(b.scidoo_booking_id)),
        )

        let { error } = await supabase
          .from("scidoo_raw_bookings")
          .upsert(safeRecords, { onConflict: "hotel_id,scidoo_booking_id" })

        // Deadlock (40P01) e' transitorio per definizione: un retry dopo
        // una breve attesa risolve quasi sempre, evitando il fallback
        // one-by-one (lento: N round-trip).
        if (error && (error.code === "40P01" || /deadlock/i.test(error.message))) {
          console.warn(`[Sync] Batch ${Math.floor(i / batchSize) + 1}: deadlock, retry unico tra 2s...`)
          await new Promise((r) => setTimeout(r, 2000))
          const retry = await supabase
            .from("scidoo_raw_bookings")
            .upsert(safeRecords, { onConflict: "hotel_id,scidoo_booking_id" })
          error = retry.error
        }

        if (error) {
          // FIX 30/04/2026 + 16/05/2026: fallback one-by-one per non perdere
          // 99 record buoni per colpa di 1 record cattivo. Logghiamo ANCHE
          // un campione di 3 record del batch failing con tutti i valori
          // delle colonne NOT NULL (checkin/checkout/hotel_id/...) cosi'
          // identifichiamo subito quale colonna sta davvero rompendo.
          console.error(
            `[Sync] Batch ${Math.floor(i / batchSize) + 1} upsert failed: ${error.message}. Sample records (NOT NULL fields):`,
            safeRecords.slice(0, 3).map((r: any) => ({
              id: r.scidoo_booking_id,
              hotel_id: r.hotel_id,
              ci: r.checkin_date,
              co: r.checkout_date,
              pms_booking_id: r.pms_booking_id,
              pms_integration_id: r.pms_integration_id,
            })),
          )
          let singleSuccess = 0
          let firstSingleErr: string | null = null
          for (const rec of safeRecords) {
            const { error: singleErr } = await supabase
              .from("scidoo_raw_bookings")
              .upsert(rec, { onConflict: "hotel_id,scidoo_booking_id" })
            if (singleErr) {
              if (!firstSingleErr) {
                firstSingleErr = `id=${rec.scidoo_booking_id} checkin=${JSON.stringify(rec.checkin_date)}: ${singleErr.message}`
              }
            } else {
              singleSuccess++
            }
          }
          imported += singleSuccess
          if (firstSingleErr) {
            errors.push(`Batch ${Math.floor(i / batchSize) + 1} fallback: ${safeRecords.length - singleSuccess}/${safeRecords.length} failed. First: ${firstSingleErr}`)
          }
          console.log(`[v0] Batch ${Math.floor(i / batchSize) + 1} fallback: ${singleSuccess}/${safeRecords.length} inserted`)
        } else {
          imported += safeRecords.length
          console.log(`[v0] Batch ${Math.floor(i / batchSize) + 1} inserted: ${imported} records`)
        }
      }

      // Record metrics event (with proper date validation)
      const eventDate = new Date().toISOString().split("T")[0]
      if (eventDate && eventDate !== "undefined") {
        await MetricsHistoryService.recordBookingEvent(
          hotelId,
          eventDate,
          "sync",
          { bookingsCount: imported },
          { isInitialSync, startDate, endDate }
        )
      }

      console.log("[v0] Raw bookings sync complete:", imported, "imported to scidoo_raw_bookings,", errors.length, "errors,", skippedRaw, "skipped (no checkin_date)")

      // Step 2: Transform to agnostic bookings table (use validBookings, not raw bookingsArray)
      console.log("[Sync] Step 2: Transforming", imported, "raw bookings to agnostic bookings table...")
      const transformResult = await transformBookingsToAgnostic(supabase, hotelId, validBookings)

      console.log("[Sync] Step 2 complete:", transformResult.imported, "bookings written to agnostic table,", transformResult.errors.length, "errors")
      console.log("[v0] Bookings sync complete:", transformResult.imported, "imported,", transformResult.errors.length, "errors")

      return {
        imported: transformResult.imported,
        errors: [...errors, ...transformResult.errors],
        success: errors.length === 0 && transformResult.errors.length === 0
      }
    } catch (error) {
      errors.push(`Failed to sync bookings: ${error}`)
      return { imported, errors, success: false }
    }
  }

  /**
   * Sync all modules (used by manual sync UI)
   */
  static async syncAll(
  hotelId: string,
  apiKey: string,
  startDate: string,
  endDate: string,
  jobId?: string,
  resumeCheckpoint?: any,
  isInitialSync: boolean = false
  ): Promise<{ bookings: SyncResult; availability: SyncResult; production: SyncResult }> {
  const supabase = await createServiceRoleClient()
  
  const bookings = await this.syncBookings(supabase, hotelId, apiKey, startDate, endDate, isInitialSync)
    const availability = await this.syncAvailability(supabase, hotelId, apiKey, startDate, endDate)

    // For production, we need the VAT number
    const { data: pmsIntegration } = await supabase
      .from("pms_integrations")
      .select("id, vat_number, config")
      .eq("hotel_id", hotelId)
      .eq("pms_name", "scidoo")
      .single()

    let production: SyncResult = { imported: 0, errors: [], success: true }
    if (pmsIntegration?.vat_number) {
      production = await this.syncFiscalProduction(
        hotelId,
        apiKey,
        (pmsIntegration.config as any)?.endpoint_url || "https://www.scidoo.com/api/v1",
        pmsIntegration.vat_number,
        pmsIntegration.id,
        startDate,
        endDate
      )
    }

    return { bookings, availability, production }
  }
}

/**
 * Transform raw Scidoo bookings to agnostic bookings table
 */
async function transformBookingsToAgnostic(
  supabase: SupabaseClient,
  hotelId: string,
  rawBookingsUnfiltered: any[]
): Promise<SyncResult> {
  const errors: string[] = []
  let imported = 0

  // Filter out bookings without checkin_date (required for agnostic table)
  const rawBookings = rawBookingsUnfiltered.filter((b: any) => b.checkin_date)

  // Load room types cache from room_types table (agnostic table)
  // Two maps: pms_room_type_id -> UUID, and scidoo_room_type_id -> UUID
  console.log("[v0] Loading room types cache for hotel:", hotelId)
  const { data: roomTypesData } = await supabase
    .from("room_types")
    .select("id, pms_room_type_id, scidoo_room_type_id, name")
    .eq("hotel_id", hotelId)

  const roomTypesCache = new Map<string, string>()
  const scidooRtCache = new Map<string, string>()
  if (roomTypesData) {
    for (const rt of roomTypesData) {
      if (rt.pms_room_type_id) roomTypesCache.set(rt.pms_room_type_id, rt.id)
      if (rt.scidoo_room_type_id) scidooRtCache.set(String(rt.scidoo_room_type_id), rt.id)
    }
  }

  // Build rate_id -> room_type UUID fallback via scidoo_raw_rates
  // When Scidoo sends room_type_id=0, we can still resolve the room type
  // through: booking.rate_id -> scidoo_raw_rates.scidoo_rate_id -> .room_type_id -> room_types.scidoo_room_type_id
  const rateToRoomType = new Map<string, string>()
  const { data: rawRates } = await supabase
    .from("scidoo_raw_rates")
    .select("scidoo_rate_id, room_type_id")
    .eq("hotel_id", hotelId)
  if (rawRates) {
    for (const rate of rawRates) {
      if (rate.room_type_id && rate.scidoo_rate_id) {
        const rtUuid = scidooRtCache.get(String(rate.room_type_id))
        if (rtUuid) {
          rateToRoomType.set(String(rate.scidoo_rate_id), rtUuid)
        }
      }
    }
  }
  console.log("[v0] Room types cache loaded:", roomTypesCache.size, "pms mappings,", rateToRoomType.size, "rate->room fallbacks")

  // Cache rates: scidoo_rate_id (string) -> { id (uuid), name, code }
  // FIX 30/04/2026 v2: prima usavamo `pms_rate_id` come colonna, ma quella
  // non esiste sulla tabella `rates`. Solo `scidoo_rate_id`. La query
  // tornava error 42703 silenzioso e rateCache restava vuoto. Ora leggiamo
  // la colonna corretta e logghiamo eventuali errori. Vedi commento dettagliato
  // in `bookings-processor.ts` per il contesto dell'incident.
  const rateCache = new Map<string, { id: string; name: string | null; code: string | null }>()
  const { data: ratesRows, error: ratesErr } = await supabase
    .from("rates")
    .select("id, scidoo_rate_id, name, code")
    .eq("hotel_id", hotelId)
  if (ratesErr) {
    console.error("[v0] Rate cache load failed (non-fatal):", ratesErr.message)
  }
  if (ratesRows) {
    for (const r of ratesRows) {
      if (r.scidoo_rate_id) {
        rateCache.set(String(r.scidoo_rate_id), { id: r.id, name: r.name, code: r.code })
      }
    }
  }
  console.log("[v0] Rate cache loaded:", rateCache.size, "scidoo_rate_id mappings")

  // Pre-load existing agnostic bookings for status protection
  const existingAgnosticMap = new Map<string, { is_cancelled: boolean; room_type_id: string | null }>()
  const agnosticIds = rawBookings.map((b: any) => String(b.id || b.internal_id))
  for (let i = 0; i < agnosticIds.length; i += 500) {
    const chunk = agnosticIds.slice(i, i + 500)
    const { data: existing } = await supabase
      .from("bookings")
      .select("pms_booking_id, is_cancelled, room_type_id")
      .eq("hotel_id", hotelId)
      .in("pms_booking_id", chunk)
    for (const row of existing || []) {
      existingAgnosticMap.set(row.pms_booking_id, row)
    }
  }

  const batchSize = 100
  for (let i = 0; i < rawBookings.length; i += batchSize) {
    const batch = rawBookings.slice(i, i + batchSize)

    const records = batch.map((booking: any) => {
      // Resolve room_type_id: direct PMS mapping first, then rate-based fallback
      const pmsRoomTypeId = String(booking.room_type_id || "0")
      let roomTypeId = roomTypesCache.get(pmsRoomTypeId) || null
      if (!roomTypeId && (pmsRoomTypeId === "0" || !booking.room_type_id)) {
        // Fallback: use rate_id to find room_type via scidoo_raw_rates
        const rateId = String(booking.rate_id || "")
        roomTypeId = rateToRoomType.get(rateId) || null
      }

      // Downgrade protection for room_type_id:
      // If we can't resolve room_type now but had one before, keep existing
      const pmsBookingId = String(booking.id || booking.internal_id)
      const existingAgnostic = existingAgnosticMap.get(pmsBookingId)
      if (!roomTypeId && existingAgnostic?.room_type_id) {
        roomTypeId = existingAgnostic.room_type_id
      }

      // Calculate room-only price from daily_price object
      // Scidoo stores daily_price as {"2026-03-06": 135, "2026-03-07": 150}
      let roomOnlyPrice = 0
      if (booking.daily_price && typeof booking.daily_price === "object") {
        roomOnlyPrice = Object.values(booking.daily_price).reduce((sum: number, v: any) => sum + (parseFloat(v) || 0), 0)
      }
      const extrasPrice = parseFloat(booking.extra_price) || 0
      const totalPrice = roomOnlyPrice + extrasPrice

      const checkInDate = booking.checkin_date
      const checkOutDate = booking.checkout_date
      // NEVER silently replace booking_date with check_in_date; fallback to NULL
      const bookingDateStr = booking.creation?.split(" ")[0] || null
      // FIX 2 (2026-04-27): rimosso il blocco "Reactivation detection" che usava
      // `last_modification` come segnale di riattivazione. Quel timestamp cambia
      // a ogni modifica del booking (anche solo nota cliente, email, ecc.), non
      // solo per riattivazioni reali. Risultato: prenotazioni con
      // `status='annullata'` nel raw venivano scritte in `bookings` con
      // `is_cancelled=false` se erano state toccate dopo la cancellazione.
      // Spiegava ~1.500 status drift osservati nella diagnostica connectors-health
      // (Barronci 1140, Moriano 189, Massabò 158, Rondini 71). La sorgente di
      // verità per cancellazioni è SOLO `mapBookingStatus(booking.status)`: se
      // Scidoo riattiva una prenotazione, lo status torna a `confermata` da solo.
      // Coerente con `bookings-processor.ts` (path B), che già funziona così.
      const isCancelled = mapBookingStatus(booking.status) === "cancelled"

      // Calculate number of nights
      let numberOfNights = booking.nights ? parseInt(booking.nights) : 1
      if (!booking.nights && checkInDate && checkOutDate) {
        const diffMs = new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()
        numberOfNights = Math.max(1, Math.round(diffMs / 86400000))
      }
      const pricePerNight = numberOfNights > 0 ? totalPrice / numberOfNights : totalPrice

      // Guest name from customer object (Scidoo structure)
      const customer = booking.customer || {}
      const guestFirstName = customer.first_name || booking.guests?.[0]?.first_name || ""
      const guestLastName = customer.last_name || booking.guests?.[0]?.last_name || ""
      const guestName = [guestFirstName, guestLastName].filter(Boolean).join(" ") || "N/A"

      // Channel from agency object
      const channel = booking.agency?.name || "Direct"
      const isDirect = !booking.agency || channel.toLowerCase() === "direct"

      // Guest country from customer citizenship or guest language
      const guestCountry = customer.citizenship || customer.language || booking.guests?.[0]?.citizenship || null

      // Rate lookup (vedi commento sulla cache sopra)
      const pmsRateId = booking.rate_id != null ? String(booking.rate_id) : null
      const rateInfo = pmsRateId ? rateCache.get(pmsRateId) : undefined

      return {
        hotel_id: hotelId,
        pms_booking_id: String(booking.id || booking.internal_id),
        pms_reservation_number: String(booking.internal_id || booking.id),
        booking_date: bookingDateStr,
        booking_datetime: booking.creation || new Date().toISOString(),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        is_cancelled: isCancelled,
        cancellation_date: isCancelled ? (booking.cancellation?.split(" ")[0] || null) : null,
        room_type_id: roomTypeId,
        guest_name: guestName,
        guest_email: customer.email || booking.guests?.[0]?.email || null,
        guest_country: guestCountry,
        number_of_rooms: booking.list_dates_room?.length || 1,
        number_of_nights: numberOfNights,
        number_of_guests: parseInt(booking.guest_count) || booking.guests?.length || 1,
        price_per_night: pricePerNight,
        total_price: totalPrice,
        net_price: roomOnlyPrice,
        extras_revenue: extrasPrice,
        channel: channel,
        is_direct: isDirect,
        // Service-only entries (city tax, extras, "Da Assegnare") have no room_type_id
        // and must NOT count towards occupancy / arrivals / room KPIs.
        is_room_booking: roomTypeId != null,
        // Rate fields: snapshot al momento del sync. FIX 30/04/2026.
        rate_id: rateInfo?.id || null,
        rate_name: booking.rate_name || rateInfo?.name || null,
        rate_code: pmsRateId,
        source: "scidoo",
        imported_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })

    const { error } = await supabase
      .from("bookings")
      .upsert(records, { onConflict: "hotel_id,pms_booking_id" })

    if (error) {
      errors.push(`Transform batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
    } else {
      imported += batch.length
      console.log(`[v0] Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rawBookings.length / batchSize)}: ${imported} imported so far`)
    }
  }

  console.log("[v0] Bookings import summary:", imported, "imported,", errors.length, "errors")
  return { imported, errors, success: errors.length === 0 }
}

/**
 * Backfill: re-transform ALL records from scidoo_raw_bookings → bookings
 * This ensures all historical RAW records are properly represented in the normalized table.
 * Can be called per-hotel or for all hotels.
 */
export async function backfillBookingsFromRaw(
  supabase: SupabaseClient,
  hotelId?: string
): Promise<{ hotel: string; imported: number; errors: string[] }[]> {
  const results: { hotel: string; imported: number; errors: string[] }[] = []

  // Get hotels to process
  let hotelsQuery = supabase
    .from("hotels")
    .select("id, name")
  if (hotelId) {
    hotelsQuery = hotelsQuery.eq("id", hotelId)
  }
  const { data: hotels } = await hotelsQuery
  if (!hotels || hotels.length === 0) return results

  for (const hotel of hotels) {
    console.log(`[Backfill] Processing ${hotel.name}...`)

    // Load ALL raw bookings for this hotel, paginated
    let allRawData: any[] = []
    let from = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data: page, error } = await supabase
        .from("scidoo_raw_bookings")
        .select("raw_data")
        .eq("hotel_id", hotel.id)
        .range(from, from + pageSize - 1)

      if (error || !page) {
        console.error(`[Backfill] Error loading raw bookings for ${hotel.name}:`, error)
        break
      }
      allRawData = allRawData.concat(page.map((r: any) => r.raw_data))
      hasMore = page.length === pageSize
      from += pageSize
    }

    console.log(`[Backfill] Loaded ${allRawData.length} raw bookings for ${hotel.name}`)

    if (allRawData.length === 0) {
      results.push({ hotel: hotel.name, imported: 0, errors: [] })
      continue
    }

    // Use the existing transform function
    const result = await transformBookingsToAgnostic(supabase, hotel.id, allRawData)
    results.push({ hotel: hotel.name, imported: result.imported, errors: result.errors })
    console.log(`[Backfill] ${hotel.name}: ${result.imported} imported, ${result.errors.length} errors`)
  }

  return results
}

function mapBookingStatus(scidooStatus: string): string {
  const s = (scidooStatus || "").toLowerCase()
  // Scidoo uses: confermata_carta, confermata_manuale, confermata, checkin, checkout,
  // cancellata, no_show, opzionale, in_attesa
  if (s.startsWith("confermata") || s === "confirmed") return "confirmed"
  if (s === "checkin" || s === "check_in" || s === "in_house") return "checked_in"
  if (s === "checkout" || s === "check_out" || s === "partita") return "checked_out"
  if (s === "cancellata" || s === "cancelled" || s === "canceled" || s === "annullata") return "cancelled"
  if (s === "no_show" || s === "noshow") return "no_show"
  if (s === "opzionale" || s === "optional") return "tentative"
  if (s === "in_attesa" || s === "waiting") return "pending"
  return "pending"
}
