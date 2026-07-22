// ETL Processor for BRiG availability (DERIVED from reservations).
//
// Aggiunto 25/05/2026 (incident Cavallino "disponibilita' obsoleta").
//
// Contesto: Brig non espone un endpoint availability dedicato (NOL ha
// solo reservations, roomtypes, rateplans, rates/update). Quindi a
// differenza di Scidoo (`AvailabilityProcessor` che legge
// `scidoo_raw_availability`), per Brig DERIVIAMO l'occupazione dalle
// reservations gia' sincronizzate in `connectors.brig_raw_bookings`:
//
//   rooms_occupied(room_type, date) =
//     count(reservations dove
//             room_type_id = X
//             AND checkin <= date < checkout
//             AND status != cancellata)
//   rooms_available(...) = room_types.total_rooms - rooms_occupied(...)
//
// Output: identico formato a `AvailabilityProcessor` Scidoo, scritto sia
// in `daily_availability` (storica) sia in `rms_availability_daily`
// (sorgente letta da dashboard / production / objectives / analytics).
//
// LIMITAZIONI rispetto a Scidoo (documentare prima di estendere ad altri
// hotel Brig):
//  - non vede stop-sell, allotment, blocchi OTA, room out-of-service:
//    quelle informazioni in Brig vivono dentro il PMS e non sono
//    esposte via NOL. Per gli hotel che le usano e' un workaround.
//  - finestra di calcolo: oggi -700gg .. oggi+700gg. Date fuori
//    finestra non vengono mai scritte (eviteremmo di esplodere il
//    numero di righe se Brig ritornasse reservation con checkout
//    lontanissimi).
//  - se l'hotel ha mismatch tra `total_rooms` e capacita' reale, il
//    fix e' in Settings > Tipologie Camere.

import { createServiceRoleClient } from "@/lib/supabase/server"
import type { ETLResult } from "../types"

const HORIZON_DAYS_BACK = 700
const HORIZON_DAYS_FORWARD = 700

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, baseDelay = 2000): Promise<T> {
  let lastError: Error | null = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const msg = lastError.message.toLowerCase()
      const isRateLimit =
        msg.includes("too many") || msg.includes("rate limit") || msg.includes("429")
      if (i < maxRetries - 1) {
        const wait = isRateLimit ? baseDelay * Math.pow(2, i + 1) : baseDelay * Math.pow(2, i)
        await delay(wait)
      }
    }
  }
  throw lastError
}

/** Estrae YYYY-MM-DD da una stringa ISO o YYYY-MM-DD (o null). */
function toDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null
  // gia' YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  // ISO
  const idx = value.indexOf("T")
  if (idx === 10) return value.slice(0, 10)
  // fallback parse
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Aggiunge n giorni a una data YYYY-MM-DD ritornando YYYY-MM-DD. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface BrigRoomTypeRow {
  id: string
  total_rooms: number | null
  brig_room_code: string | null
  brig_reservation_room_code: string | null
}

export class BrigAvailabilityProcessor {
  private hotelId: string
  private etlJobId: string

  constructor(hotelId: string, etlJobId: string) {
    this.hotelId = hotelId
    this.etlJobId = etlJobId
  }

  async process(): Promise<ETLResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsProcessed = 0
    let recordsInserted = 0
    const recordsUpdated = 0
    const recordsSkipped = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      console.log("[v0] BrigAvailETL: starting for hotel", this.hotelId)

      // 1) Carica le room_types attive per l'hotel.
      // Mapping codice Brig -> room_type UUID.
      // Brig usa due codici diversi nelle reservations (`roomCode` di
      // `daily-occupancy-filters`, salvato in `brig_raw_bookings.room_code`)
      // e nelle tariffe (`code` di `roomtypes/list`, salvato in
      // `room_types.brig_room_code`). Per l'occupazione il valore di
      // riferimento e' `brig_reservation_room_code`. Se mancante, fallback
      // su `brig_room_code`.
      const { data: roomTypes, error: rtError } = await withRetry(async () => {
        const r = await supabase
          .from("room_types")
          .select("id, total_rooms, brig_room_code, brig_reservation_room_code")
          .eq("hotel_id", this.hotelId)
          .eq("is_active", true)
        if (r.error) throw new Error(r.error.message)
        return { data: (r.data || []) as BrigRoomTypeRow[], error: null }
      })

      if (rtError) throw new Error(`Failed to load room types: ${(rtError as Error).message}`)

      const codeToRoomTypeId = new Map<string, string>()
      const roomTypeCapacity = new Map<string, number>()
      for (const rt of roomTypes || []) {
        const code =
          (rt.brig_reservation_room_code && rt.brig_reservation_room_code.trim()) ||
          (rt.brig_room_code && rt.brig_room_code.trim()) ||
          null
        if (code) codeToRoomTypeId.set(code, rt.id)
        // Per la mappa capacita' usiamo il valore configurato in
        // `room_types.total_rooms`. Se NULL -> 0 (la riga in
        // rms_availability_daily verra' comunque scritta, total_rooms=0;
        // upstream si vedra' che la capacita' va configurata).
        roomTypeCapacity.set(rt.id, typeof rt.total_rooms === "number" ? rt.total_rooms : 0)
      }

      if (codeToRoomTypeId.size === 0) {
        console.log("[v0] BrigAvailETL: no room types with brig codes, skipping")
        return {
          success: true,
          records_processed: 0,
          records_inserted: 0,
          records_updated: 0,
          records_skipped: 0,
          records_failed: 0,
          error_message: undefined,
          duration_ms: Date.now() - startTime,
        }
      }

      // 2) Carica le reservations Brig non cancellate.
      //
      // FIX 01/06/2026 (incident Cavallino "disponibilita' non torna"): il
      // filtro precedente era `.or("status_code.is.null,status_code.neq.4")`,
      // basato sulla colonna `status_code` (BRIG_STATUS.CANCELLED=4). Ma per
      // Cavallino quella colonna e' SEMPRE NULL (verificato sui dati: 3258
      // righe tutte con status_code=null), quindi il filtro lasciava passare
      // TUTTO, incluse le 38 prenotazioni cancellate. Il segnale di
      // cancellazione reale di BRiG vive in `raw_data->>status` con valore
      // 'DELETED' (le altre sono 'CONFIRMED'). Ora leggiamo quel campo
      // (aliasato a `brig_status`) e scartiamo i DELETED nel loop di
      // espansione. Manteniamo anche il check su `status_code===4` come
      // fallback per eventuali hotel BRiG futuri che popolino la colonna.
      // No-show e Optional NON liberano la stanza -> restano occupanti.
      const today = new Date().toISOString().slice(0, 10)
      const horizonStart = addDays(today, -HORIZON_DAYS_BACK)
      const horizonEnd = addDays(today, HORIZON_DAYS_FORWARD)

      // Fetch in batch: brig_raw_bookings puo' avere 2k+ righe per Cavallino.
      // Selezioniamo solo i campi che ci servono per non saturare memoria.
      const PAGE = 1000
      let offset = 0
      const reservations: Array<{
        room_code: string | null
        checkin: string | null
        checkout: string | null
        status_code: number | null
        brig_status: string | null
        is_stale_cancelled: boolean | null
      }> = []
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: page, error: resErr } = await withRetry(async () => {
          const r = await supabase
            .schema("connectors")
            .from("brig_raw_bookings")
            .select("room_code, checkin, checkout, status_code, is_stale_cancelled, brig_status:raw_data->>status")
            .eq("hotel_id", this.hotelId)
            .order("checkin", { ascending: true })
            .range(offset, offset + PAGE - 1)
          if (r.error) throw new Error(r.error.message)
          return { data: r.data || [], error: null }
        })
        if (resErr) throw new Error(`Failed to load reservations: ${(resErr as Error).message}`)
        reservations.push(...(page as typeof reservations))
        if (!page || page.length < PAGE) break
        offset += PAGE
        if (offset > 100_000) {
          // safety net contro loop infiniti
          console.warn("[v0] BrigAvailETL: hard cap raggiunto a 100k reservations")
          break
        }
      }

      console.log(
        `[v0] BrigAvailETL: loaded ${reservations.length} reservations ` +
          `(${codeToRoomTypeId.size} room type codes)`,
      )

      // 3) Espandi ogni reservation in night-by-night counter:
      // chiave `${roomTypeId}::${date}`.
      const occupancy = new Map<string, number>()
      let cancelledSkipped = 0
      for (const r of reservations) {
        recordsProcessed++
        // Scarta le prenotazioni cancellate: il segnale reale BRiG e'
        // `raw_data->>status === 'DELETED'` (aliasato a `brig_status`);
        // `status_code===4` resta come fallback per hotel che popolano la
        // colonna. `is_stale_cancelled` (FIX 04/06/2026) e' il tombstone locale
        // per prenotazioni SPARITE dal feed BRiG (cancellate in Bedzzle ma non
        // piu' ritornate dall'API): riconciliate per finestra di grazia su
        // last_seen_at (vedi reconcileBrigStaleCancellations). Le cancellate NON
        // devono occupare la camera.
        if (
          r.brig_status === "DELETED" ||
          r.status_code === 4 ||
          r.is_stale_cancelled === true
        ) {
          cancelledSkipped++
          continue
        }
        const code = (r.room_code || "").trim()
        if (!code) continue
        const roomTypeId = codeToRoomTypeId.get(code)
        if (!roomTypeId) {
          // Reservation con un room_code Brig non mappato in room_types:
          // skip. Documentato nel log per facilitare la diagnosi se la
          // copertura risulta troppo bassa.
          continue
        }
        const checkin = toDateOnly(r.checkin)
        const checkout = toDateOnly(r.checkout)
        if (!checkin || !checkout) continue
        if (checkout <= checkin) continue
        // clipping al range orizzonte
        const startDate = checkin < horizonStart ? horizonStart : checkin
        const endDate = checkout > horizonEnd ? horizonEnd : checkout
        if (endDate <= startDate) continue
        let cursor = startDate
        // contatore difensivo: max 3650 notti (10y) per reservation.
        for (let i = 0; i < 3650 && cursor < endDate; i++) {
          const key = `${roomTypeId}::${cursor}`
          occupancy.set(key, (occupancy.get(key) ?? 0) + 1)
          cursor = addDays(cursor, 1)
        }
      }

      // 4) Componi i record per upsert in rms_availability_daily +
      // daily_availability. Generiamo una riga per OGNI (room_type, date)
      // della finestra orizzonte cosi' la dashboard non vede "buchi" (i
      // giorni senza prenotazioni hanno comunque availability = total_rooms).
      const upsertRows: any[] = []
      const now = new Date().toISOString()
      for (const [roomTypeId, totalRooms] of roomTypeCapacity.entries()) {
        // genera tutte le date della finestra
        let cursor = horizonStart
        // safety net 1500 giorni
        for (let i = 0; i < 1500 && cursor <= horizonEnd; i++) {
          const occupied = occupancy.get(`${roomTypeId}::${cursor}`) ?? 0
          const available = Math.max(0, (totalRooms ?? 0) - occupied)
          // NB: lo schema reale di `rms_availability_daily` e
          // `daily_availability` NON ha la colonna `rooms_occupied`
          // (verificato 25/05/2026). I campi disponibili sono
          // total_rooms / rooms_out_of_service / rooms_available /
          // is_frozen / source. Gli upstream (production/dashboard)
          // calcolano l'occupato come `total_rooms - rooms_available -
          // rooms_out_of_service`. Lasciare un campo `rooms_occupied`
          // qui faceva fallire silenziosamente l'upsert con PGRST204
          // (column not found) → tabella canonica vuota per Cavallino.
          // `void occupied`: la variabile ci serve a calcolare
          // `available`, ma non viene scritta in DB.
          void occupied
          upsertRows.push({
            hotel_id: this.hotelId,
            room_type_id: roomTypeId,
            date: cursor,
            total_rooms: totalRooms ?? 0,
            rooms_available: available,
            rooms_out_of_service: 0,
            // `is_frozen` esplicitamente false: stiamo scrivendo da
            // ETL (sorgente "brig"), non importi manuali gsheets che
            // sono frozen. Se in futuro un utente "congela" una data
            // il flag andra' rispettato (ma non e' il caso oggi: il
            // ramo Brig non interferisce con dati gsheets perche'
            // sono hotel diversi).
            is_frozen: false,
            source: "brig",
            updated_at: now,
          })
          cursor = addDays(cursor, 1)
        }
      }

      console.log(`[v0] BrigAvailETL: prepared ${upsertRows.length} availability rows`)

      // 5) Bulk upsert (chunks di 500). Stesso onConflict di
      // AvailabilityProcessor Scidoo per non duplicare righe.
      const BATCH = 500
      for (let i = 0; i < upsertRows.length; i += BATCH) {
        const chunk = upsertRows.slice(i, i + BATCH)
        try {
          await withRetry(async () => {
            const { error } = await supabase
              .from("daily_availability")
              .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
            if (error) throw new Error(error.message)
          })
          // Mirror in rms_availability_daily (sorgente per dashboard /
          // production / objectives / analytics). Non blocchiamo l'ETL se
          // questo fallisce ma logghiamo perche' senza la dashboard si
          // svuota.
          try {
            await withRetry(async () => {
              const { error } = await supabase
                .from("rms_availability_daily")
                .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
              if (error) throw new Error(error.message)
            })
          } catch (rmsErr) {
            console.error("[v0] BrigAvailETL: rms_availability_daily mirror error:", rmsErr)
          }
          recordsInserted += chunk.length
        } catch (err) {
          recordsFailed += chunk.length
          console.error("[v0] BrigAvailETL: batch error:", err)
        }
      }

      console.log("[v0] BrigAvailETL: done", {
        processed: recordsProcessed,
        cancelled_skipped: cancelledSkipped,
        rows_written: recordsInserted,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] BrigAvailETL: fatal", errorMessage)
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_processed: recordsProcessed,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_skipped: recordsSkipped,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }
}
