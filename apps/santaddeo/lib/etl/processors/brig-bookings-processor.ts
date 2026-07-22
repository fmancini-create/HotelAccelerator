// ETL Processor for BRiG bookings.
// Parallelo a BookingsProcessor (Scidoo): legge connectors.brig_raw_bookings
// processed=false, mappa in `public.bookings`, marca processed=true e
// applica una reconciliation step per allineare cancellazioni.

import { createServiceRoleClient } from "@/lib/supabase/server"
import { BrigMapper, type BrigBookingRow, type BrigRoomTypeMapping } from "../mappers/brig-mapper"
import { BRIG_STATUS, brigStatusToCode } from "@/lib/connectors/brig/types"
import type { ETLResult } from "../types"

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
        console.log(`[v0] Retry ${i + 1}/${maxRetries} after ${wait}ms (rate limit: ${isRateLimit})`)
        await delay(wait)
      }
    }
  }
  throw lastError
}

export class BrigBookingsProcessor {
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
      console.log("[v0] BrigETL: starting for hotel", this.hotelId)

      // 1) Carica i mapping room_types.
      // BRiG espone DUE namespace per le camere:
      //  - getRoomTypes() -> `code` numerico (es. "67255") salvato in `brig_room_code`,
      //    usato per il push tariffe (PUT /rates/update).
      //  - getReservations() -> `roomCode` descrittivo (es. "MATRIMONIALE", "DOPPIA"),
      //    salvato in `brig_reservation_room_code`, usato per linkare booking->room_type.
      // Se `brig_reservation_room_code` non e' valorizzato, cadiamo su `brig_room_code`
      // per retrocompatibilita' (il caso in cui i due namespace coincidono).
      const { data: roomTypes, error: rtError } = await supabase
        .from("room_types")
        .select("id, brig_room_code, brig_reservation_room_code")
        .eq("hotel_id", this.hotelId)

      if (rtError) {
        console.log("[v0] BrigETL: error fetching room_types, continuing without mappings:", rtError.message)
      }

      const mappings: BrigRoomTypeMapping[] = (roomTypes || [])
        .map((rt) => ({
          brig_room_code: (rt.brig_reservation_room_code as string | null) || (rt.brig_room_code as string | null) || "",
          santaddeo_room_type_id: rt.id,
        }))
        .filter((m) => m.brig_room_code)
      console.log(`[v0] BrigETL: ${mappings.length} room_type mappings`)

      const mapper = new BrigMapper(this.hotelId, mappings)

      // 2) Carica TUTTE le righe non processate (paginazione DB)
      const allRaw: Array<{ id: string; raw_data: unknown; brig_reservation_id: string }> = []
      let offset = 0
      const FETCH_SIZE = 1000
      while (true) {
        const { data: batch, error: fetchError } = await supabase
          .schema("connectors")
          .from("brig_raw_bookings")
          .select("id, brig_reservation_id, raw_data")
          .eq("hotel_id", this.hotelId)
          .eq("processed", false)
          .order("synced_at", { ascending: true })
          .range(offset, offset + FETCH_SIZE - 1)

        if (fetchError) {
          console.log("[v0] BrigETL: error fetching raw bookings:", fetchError.message)
          break
        }
        if (!batch || batch.length === 0) break
        allRaw.push(...(batch as typeof allRaw))
        offset += FETCH_SIZE
        if (batch.length < FETCH_SIZE) break
      }

      console.log(`[v0] BrigETL: found ${allRaw.length} unprocessed bookings`)

      // 3) Mappa tutto, raccogliendo righe processate / saltate / errori
      const toUpsert: BrigBookingRow[] = []
      const processedIds: string[] = []
      const failedIds: string[] = []

      for (const raw of allRaw) {
        recordsProcessed++
        try {
          const row = mapper.mapBooking(raw.raw_data as Parameters<BrigMapper["mapBooking"]>[0])
          if (row == null) {
            // Booking non mappabile (date mancanti / nights<=0): la marchiamo
            // comunque come processata per non riprocessarla all'infinito.
            processedIds.push(raw.id)
            continue
          }
          toUpsert.push(row)
          processedIds.push(raw.id)
        } catch (error) {
          recordsFailed++
          failedIds.push(raw.id)
          console.error("[v0] BrigETL: mapping error", raw.brig_reservation_id, error)
        }
      }

      console.log(
        `[v0] BrigETL: mapped ${toUpsert.length} bookings, ${failedIds.length} failed. Upserting in batches...`,
      )

      // 4) Batch upsert in `bookings` (chunks di 200)
      const BATCH_SIZE = 200
      const upsertErrors: string[] = []
      for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
        const chunk = toUpsert.slice(i, i + BATCH_SIZE)
        try {
          const { error } = await withRetry(async () => {
            return await supabase
              .from("bookings")
              .upsert(chunk, { onConflict: "hotel_id,pms_booking_id", ignoreDuplicates: false })
          })
          if (error) throw error
          recordsInserted += chunk.length
          console.log(
            `[v0] BrigETL: batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Math.min(i + BATCH_SIZE, toUpsert.length)}/${toUpsert.length}`,
          )
        } catch (error) {
          const batchMsg = error instanceof Error ? error.message : String(error)
          console.error("[v0] BrigETL: batch error, falling back to per-row:", batchMsg)
          if (upsertErrors.length < 5) upsertErrors.push(`batch: ${batchMsg.slice(0, 200)}`)
          // Fallback: inseriamo riga per riga per identificare i record problematici
          for (const row of chunk) {
            try {
              const { error: singleErr } = await supabase
                .from("bookings")
                .upsert(row, { onConflict: "hotel_id,pms_booking_id" })
              if (singleErr) throw singleErr
              recordsInserted++
            } catch (singleError) {
              recordsFailed++
              const singleMsg =
                singleError instanceof Error ? singleError.message : String(singleError)
              console.error("[v0] BrigETL: single row error:", row.pms_booking_id, singleMsg)
              if (upsertErrors.length < 10)
                upsertErrors.push(`row ${row.pms_booking_id}: ${singleMsg.slice(0, 200)}`)
            }
          }
        }
      }
      if (upsertErrors.length > 0 && !errorMessage) {
        errorMessage = upsertErrors.slice(0, 3).join(" | ")
      }

      // 5) Marca tutti i raw come processed (chunks di 500)
      const allProcessedIds = [...processedIds, ...failedIds]
      for (let i = 0; i < allProcessedIds.length; i += 500) {
        const chunk = allProcessedIds.slice(i, i + 500)
        await supabase
          .schema("connectors")
          .from("brig_raw_bookings")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .in("id", chunk)
      }

      // 6) Reconciliation step: allinea is_cancelled per i raw "Annullata" che
      // potrebbero essere stati saltati (phantom bookings). Stesso pattern del
      // bookings-processor Scidoo.
      try {
        // BUG FIX 24/06/2026: il feed BRiG `daily-occupancy-filters` manda lo
        // stato come STRINGA dentro `raw_data->>'status'` ("DELETED"), mentre
        // le colonne `original_status`/`status_code` sono SEMPRE NULL su
        // Cavallino. Il vecchio filtro guardava solo quelle colonne -> non
        // riallineava MAI le cancellate stringa (verificato: 113 DELETED
        // restavano is_cancelled=false). Ora leggiamo lo status REALE dal
        // raw_data e normalizziamo con brigStatusToCode (come il mapper e il
        // processor availability).
        const { data: cancelledRaw } = await supabase
          .schema("connectors")
          .from("brig_raw_bookings")
          .select("brig_reservation_id, original_status, status_code, raw_data")
          .eq("hotel_id", this.hotelId)
        const cancelledIds = (cancelledRaw || [])
          .filter((r) => {
            const txt = (r.original_status || "").trim().toLowerCase()
            if (txt === "annullata" || txt === "cancelled" || txt === "cancellata") return true
            if (r.status_code === 4) return true
            const rawStatus = (r.raw_data as Record<string, unknown> | null)?.status
            return brigStatusToCode(rawStatus) === BRIG_STATUS.CANCELLED
          })
          .map((r) => r.brig_reservation_id)
          .filter((id): id is string => Boolean(id))

        if (cancelledIds.length > 0) {
          const RECONCILE_CHUNK = 200
          let reconciled = 0
          for (let i = 0; i < cancelledIds.length; i += RECONCILE_CHUNK) {
            const chunk = cancelledIds.slice(i, i + RECONCILE_CHUNK)
            const { count } = await supabase
              .from("bookings")
              .update(
                { is_cancelled: true, updated_at: new Date().toISOString() },
                { count: "exact" },
              )
              .eq("hotel_id", this.hotelId)
              .eq("is_cancelled", false)
              .in("pms_booking_id", chunk)
            reconciled += count || 0
          }
          if (reconciled > 0) {
            console.log(`[v0] BrigETL: reconciliation - phantom cancelled allineati: ${reconciled}`)
          }
        }
      } catch (reconErr) {
        console.error("[v0] BrigETL: reconciliation step failed (non-fatal):", reconErr)
      }

      console.log("[v0] BrigETL: complete", {
        processed: recordsProcessed,
        inserted: recordsInserted,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] BrigETL: error:", errorMessage)
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
