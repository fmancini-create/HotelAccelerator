// ETL Processor for Slope availability (DERIVED from reservations).
//
// Aggiunto 17/07/2026 (dashboard Superlusso: occupancy 0% pur con notti
// vendute -> daily_availability VUOTA per gli hotel Slope).
//
// Contesto: come Brig, il connettore Slope NON espone un endpoint
// availability dedicato: la Partner API v1 restituisce solo le reservations.
// Quindi DERIVIAMO l'occupazione dalle prenotazioni GIA' mappate in
// `public.bookings` dal SlopeBookingsProcessor (che ha gia' risolto
// room_type_id, is_cancelled e number_of_rooms). Questo e' piu' robusto del
// parsing del raw perche' riusa la normalizzazione dell'ETL a monte.
//
//   rooms_occupied(room_type, date) =
//     sum(number_of_rooms delle bookings dove
//           room_type_id = X
//           AND check_in_date <= date < check_out_date
//           AND is_cancelled = false)
//   rooms_available(...) = room_types.total_rooms - rooms_occupied(...)
//
// Output: stesso formato di AvailabilityProcessor (Scidoo) /
// BrigAvailabilityProcessor, scritto sia in `daily_availability` (storica)
// sia in `rms_availability_daily` (sorgente letta da dashboard / production /
// objectives / analytics). onConflict identico per non duplicare righe.
//
// LIMITAZIONI (come Brig): non vede stop-sell, allotment, blocchi OTA o
// room out-of-service (non esposti dalla Partner API Slope). La capacita' e'
// quella configurata in room_types.total_rooms (Settings > Tipologie Camere).

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
      const isRateLimit = msg.includes("too many") || msg.includes("rate limit") || msg.includes("429")
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const idx = value.indexOf("T")
  if (idx === 10) return value.slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Aggiunge n giorni a una data YYYY-MM-DD ritornando YYYY-MM-DD. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

interface SlopeRoomTypeRow {
  id: string
  total_rooms: number | null
}

interface SlopeBookingNightRow {
  room_type_id: string | null
  check_in_date: string | null
  check_out_date: string | null
  number_of_rooms: number | null
}

export class SlopeAvailabilityProcessor {
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
      console.log("[SlopeAvailETL] starting for hotel", this.hotelId)

      // 1) Room types ATTIVE con capacita'. Le disattivate non entrano nella
      // capacita' della struttura (coerente con la pagina Camere Vendute).
      const { data: roomTypes } = await withRetry(async () => {
        const r = await supabase
          .from("room_types")
          .select("id, total_rooms")
          .eq("hotel_id", this.hotelId)
          .eq("is_active", true)
        if (r.error) throw new Error(r.error.message)
        return { data: (r.data || []) as SlopeRoomTypeRow[] }
      })

      const roomTypeCapacity = new Map<string, number>()
      for (const rt of roomTypes || []) {
        roomTypeCapacity.set(rt.id, typeof rt.total_rooms === "number" ? rt.total_rooms : 0)
      }

      if (roomTypeCapacity.size === 0) {
        console.log("[SlopeAvailETL] no active room types, skipping")
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

      const today = new Date().toISOString().slice(0, 10)
      const horizonStart = addDays(today, -HORIZON_DAYS_BACK)
      const horizonEnd = addDays(today, HORIZON_DAYS_FORWARD)

      // 2) Prenotazioni NON cancellate da public.bookings (gia' mappate
      // dall'ETL Slope). Paginazione DB (cap 1000 PostgREST).
      const PAGE = 1000
      let offset = 0
      const bookings: SlopeBookingNightRow[] = []
      while (true) {
        const { data: page } = await withRetry(async () => {
          const r = await supabase
            .from("bookings")
            .select("room_type_id, check_in_date, check_out_date, number_of_rooms")
            .eq("hotel_id", this.hotelId)
            .eq("is_cancelled", false)
            .order("check_in_date", { ascending: true })
            .range(offset, offset + PAGE - 1)
          if (r.error) throw new Error(r.error.message)
          return { data: (r.data || []) as SlopeBookingNightRow[] }
        })
        if (!page || page.length === 0) break
        bookings.push(...page)
        offset += PAGE
        if (page.length < PAGE) break
        if (offset > 100_000) {
          console.warn("[SlopeAvailETL] hard cap 100k bookings raggiunto")
          break
        }
      }

      console.log(`[SlopeAvailETL] loaded ${bookings.length} active bookings, ${roomTypeCapacity.size} room types`)

      // 3) Espandi ogni prenotazione notte-per-notte: chiave `${roomTypeId}::${date}`.
      const occupancy = new Map<string, number>()
      for (const b of bookings) {
        recordsProcessed++
        const roomTypeId = b.room_type_id
        // Solo tipologie attive (le disattivate non contano nella capacita').
        if (!roomTypeId || !roomTypeCapacity.has(roomTypeId)) continue
        const checkin = toDateOnly(b.check_in_date)
        const checkout = toDateOnly(b.check_out_date)
        if (!checkin || !checkout || checkout <= checkin) continue
        const rooms = typeof b.number_of_rooms === "number" && b.number_of_rooms > 0 ? b.number_of_rooms : 1
        const startDate = checkin < horizonStart ? horizonStart : checkin
        const endDate = checkout > horizonEnd ? horizonEnd : checkout
        if (endDate <= startDate) continue
        let cursor = startDate
        for (let i = 0; i < 3650 && cursor < endDate; i++) {
          const key = `${roomTypeId}::${cursor}`
          occupancy.set(key, (occupancy.get(key) ?? 0) + rooms)
          cursor = addDays(cursor, 1)
        }
      }

      // 4) Una riga per OGNI (room_type, date) della finestra: i giorni senza
      // prenotazioni hanno availability = total_rooms (niente "buchi" in dashboard).
      const upsertRows: Array<Record<string, unknown>> = []
      const now = new Date().toISOString()
      for (const [roomTypeId, totalRooms] of roomTypeCapacity.entries()) {
        let cursor = horizonStart
        for (let i = 0; i < 1500 && cursor <= horizonEnd; i++) {
          const occupied = occupancy.get(`${roomTypeId}::${cursor}`) ?? 0
          const available = Math.max(0, (totalRooms ?? 0) - occupied)
          upsertRows.push({
            hotel_id: this.hotelId,
            room_type_id: roomTypeId,
            date: cursor,
            total_rooms: totalRooms ?? 0,
            rooms_available: available,
            rooms_out_of_service: 0,
            is_frozen: false,
            source: "slope",
            updated_at: now,
          })
          cursor = addDays(cursor, 1)
        }
      }

      console.log(`[SlopeAvailETL] prepared ${upsertRows.length} availability rows`)

      // 5) Bulk upsert (chunks di 500) su daily_availability + mirror su
      // rms_availability_daily. Stesso onConflict di Scidoo/Brig.
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
          try {
            await withRetry(async () => {
              const { error } = await supabase
                .from("rms_availability_daily")
                .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
              if (error) throw new Error(error.message)
            })
          } catch (rmsErr) {
            console.error("[SlopeAvailETL] rms_availability_daily mirror error:", rmsErr)
          }
          recordsInserted += chunk.length
        } catch (err) {
          recordsFailed += chunk.length
          console.error("[SlopeAvailETL] batch error:", err)
        }
      }

      console.log("[SlopeAvailETL] done", {
        processed: recordsProcessed,
        rows_written: recordsInserted,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[SlopeAvailETL] fatal", errorMessage)
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
