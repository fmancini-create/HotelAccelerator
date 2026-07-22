// ETL Processor for Slope bookings.
// Parallelo a BrigBookingsProcessor: legge connectors.slope_raw_bookings
// processed=false, mappa in `public.bookings`, marca processed=true e
// applica una reconciliation step per allineare cancellazioni + hard delete.

import { createServiceRoleClient } from "@/lib/supabase/server"
import { SlopeMapper, type SlopeBookingRow, type SlopeRoomTypeMapping } from "../mappers/slope-mapper"
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
      const isRateLimit = msg.includes("too many") || msg.includes("rate limit") || msg.includes("429")
      if (i < maxRetries - 1) {
        const wait = isRateLimit ? baseDelay * Math.pow(2, i + 1) : baseDelay * Math.pow(2, i)
        await delay(wait)
      }
    }
  }
  throw lastError
}

export class SlopeBookingsProcessor {
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
      console.log("[SlopeETL] starting for hotel", this.hotelId)

      // 1) Mapping camere: room_types.slope_lodging_type_id -> room_types.id
      const { data: roomTypes, error: rtError } = await supabase
        .from("room_types")
        .select("id, slope_lodging_type_id")
        .eq("hotel_id", this.hotelId)
      if (rtError) {
        console.log("[SlopeETL] error fetching room_types, continuing without mappings:", rtError.message)
      }
      const mappings: SlopeRoomTypeMapping[] = (roomTypes || [])
        .filter((rt) => rt.slope_lodging_type_id)
        .map((rt) => ({
          slope_lodging_type_id: rt.slope_lodging_type_id as string,
          santaddeo_room_type_id: rt.id,
        }))
      console.log(`[SlopeETL] ${mappings.length} room_type mappings`)

      const mapper = new SlopeMapper(this.hotelId, mappings)

      // 2) Righe non processate (paginazione DB, cap 1000 PostgREST)
      const allRaw: Array<{
        id: string
        slope_reservation_id: string
        raw_data: unknown
        is_deleted_on_pms: boolean
      }> = []
      let offset = 0
      const FETCH_SIZE = 1000
      while (true) {
        const { data: batch, error: fetchError } = await supabase
          .schema("connectors")
          .from("slope_raw_bookings")
          .select("id, slope_reservation_id, raw_data, is_deleted_on_pms")
          .eq("hotel_id", this.hotelId)
          .eq("processed", false)
          .order("synced_at", { ascending: true })
          .range(offset, offset + FETCH_SIZE - 1)
        if (fetchError) {
          console.log("[SlopeETL] error fetching raw bookings:", fetchError.message)
          break
        }
        if (!batch || batch.length === 0) break
        allRaw.push(...(batch as typeof allRaw))
        offset += FETCH_SIZE
        if (batch.length < FETCH_SIZE) break
      }
      console.log(`[SlopeETL] found ${allRaw.length} unprocessed bookings`)

      // 3) Mapping
      const toUpsert: SlopeBookingRow[] = []
      const processedIds: string[] = []
      const failedIds: string[] = []
      for (const raw of allRaw) {
        recordsProcessed++
        try {
          const row = mapper.mapBooking(raw.raw_data as Parameters<SlopeMapper["mapBooking"]>[0])
          if (row == null) {
            processedIds.push(raw.id)
            continue
          }
          // Hard delete su Slope (deleted-resources): trattiamo come cancellata.
          // La riga in public.bookings resta (storico produzione) ma esce da
          // occupancy/pickup come una cancellazione.
          if (raw.is_deleted_on_pms) row.is_cancelled = true
          toUpsert.push(row)
          processedIds.push(raw.id)
        } catch (error) {
          recordsFailed++
          failedIds.push(raw.id)
          console.error("[SlopeETL] mapping error", raw.slope_reservation_id, error)
        }
      }

      // 4) Batch upsert in `bookings` (chunks di 200, fallback per-riga)
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
        } catch (error) {
          const batchMsg = error instanceof Error ? error.message : String(error)
          console.error("[SlopeETL] batch error, falling back to per-row:", batchMsg)
          if (upsertErrors.length < 5) upsertErrors.push(`batch: ${batchMsg.slice(0, 200)}`)
          for (const row of chunk) {
            try {
              const { error: singleErr } = await supabase
                .from("bookings")
                .upsert(row, { onConflict: "hotel_id,pms_booking_id" })
              if (singleErr) throw singleErr
              recordsInserted++
            } catch (singleError) {
              recordsFailed++
              const singleMsg = singleError instanceof Error ? singleError.message : String(singleError)
              console.error("[SlopeETL] single row error:", row.pms_booking_id, singleMsg)
              if (upsertErrors.length < 10) upsertErrors.push(`row ${row.pms_booking_id}: ${singleMsg.slice(0, 200)}`)
            }
          }
        }
      }
      if (upsertErrors.length > 0 && !errorMessage) {
        errorMessage = upsertErrors.slice(0, 3).join(" | ")
      }

      // 5) Marca raw come processed (chunks di 500)
      const allProcessedIds = [...processedIds, ...failedIds]
      for (let i = 0; i < allProcessedIds.length; i += 500) {
        const chunk = allProcessedIds.slice(i, i + 500)
        await supabase
          .schema("connectors")
          .from("slope_raw_bookings")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .in("id", chunk)
      }

      // 6) Reconciliation: allinea is_cancelled in public.bookings per tutti
      // i raw cancellati (isCanceled) o hard-deleted, anche se processati in
      // run precedenti (pattern anti "phantom bookings" di Brig/Scidoo).
      try {
        const cancelledIds: string[] = []
        for (let from = 0; ; from += 1000) {
          const { data: cancelledRaw, error } = await supabase
            .schema("connectors")
            .from("slope_raw_bookings")
            .select("slope_reservation_id")
            .eq("hotel_id", this.hotelId)
            .or("is_canceled.eq.true,is_deleted_on_pms.eq.true")
            .range(from, from + 999)
          if (error) throw new Error(error.message)
          const rows = cancelledRaw ?? []
          cancelledIds.push(...rows.map((r: any) => r.slope_reservation_id).filter(Boolean))
          if (rows.length < 1000) break
        }
        if (cancelledIds.length > 0) {
          const RECONCILE_CHUNK = 200
          let reconciled = 0
          for (let i = 0; i < cancelledIds.length; i += RECONCILE_CHUNK) {
            const chunk = cancelledIds.slice(i, i + RECONCILE_CHUNK)
            const { count } = await supabase
              .from("bookings")
              .update({ is_cancelled: true, updated_at: new Date().toISOString() }, { count: "exact" })
              .eq("hotel_id", this.hotelId)
              .eq("is_cancelled", false)
              .in("pms_booking_id", chunk)
            reconciled += count || 0
          }
          if (reconciled > 0) {
            console.log(`[SlopeETL] reconciliation - phantom cancelled allineati: ${reconciled}`)
          }
        }
      } catch (reconErr) {
        console.error("[SlopeETL] reconciliation step failed (non-fatal):", reconErr)
      }

      console.log("[SlopeETL] complete", {
        processed: recordsProcessed,
        inserted: recordsInserted,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[SlopeETL] error:", errorMessage)
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
