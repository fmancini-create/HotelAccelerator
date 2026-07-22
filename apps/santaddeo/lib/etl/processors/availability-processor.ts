// ETL Processor for Availability
// Transforms raw availability from scidoo_raw_availability to canonical daily_availability / rms_availability_daily
// PMS-AGNOSTIC: reads from Supabase raw tables, maps via room_types, writes to canonical tables.
// No direct dependency on Neon or any specific PMS connector schema.

import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooMapper } from "../mappers/scidoo-mapper"
import type { ETLResult, RoomTypeMapping } from "../types"

export class AvailabilityProcessor {
  private hotelId: string
  private etlJobId: string

  constructor(hotelId: string, etlJobId: string) {
    this.hotelId = hotelId
    this.etlJobId = etlJobId
  }

  private async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 3000): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error
        const errorMessage = error instanceof Error ? error.message : String(error)

        const isRateLimitError =
          errorMessage.includes("Too Many") ||
          errorMessage.includes("429") ||
          (error instanceof SyntaxError && errorMessage.includes("is not valid JSON"))

        if (isRateLimitError) {
          const delay = initialDelay * Math.pow(2, attempt)
          console.log(
            `[v0] ETL: Rate limit detected (${errorMessage.substring(0, 50)}...), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        throw error
      }
    }

    throw lastError || new Error("Max retries exceeded")
  }

  async process(): Promise<ETLResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsProcessed = 0
    let recordsInserted = 0
    let recordsUpdated = 0
    const recordsSkipped = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      console.log("[v0] ETL: Starting availability processing for hotel", this.hotelId)

      // Step 1: Load room type mappings from canonical room_types table (PMS-agnostic)
      // The mapping scidoo_room_type_id -> room_type UUID lives in room_types
      console.log("[v0] ETL: Step 1 - Loading room type mappings from room_types...")
      const { data: roomTypes, error: rtError } = await supabase
        .from("room_types")
        .select("id, scidoo_room_type_id, name, total_rooms")
        .eq("hotel_id", this.hotelId)
        .eq("is_active", true)

      if (rtError) {
        throw new Error(`Failed to load room types: ${rtError.message}`)
      }

      // Build mapping: scidoo_room_type_id -> room_type UUID
      const scidooToUuid: Record<string, string> = {}
      const roomTypeTotalRooms: Record<string, number> = {}
      const mappings: RoomTypeMapping[] = []

      for (const rt of roomTypes || []) {
        if (rt.scidoo_room_type_id) {
          scidooToUuid[String(rt.scidoo_room_type_id)] = rt.id
          roomTypeTotalRooms[String(rt.scidoo_room_type_id)] = rt.total_rooms || 0
          mappings.push({
            scidoo_room_type_id: String(rt.scidoo_room_type_id),
            santaddeo_room_type_id: rt.id, // UUID, not scidoo ID
          })
        }
      }

      console.log("[v0] ETL: Loaded", mappings.length, "room type mappings from room_types table")

      if (mappings.length === 0) {
        console.log("[v0] ETL: No active room types with scidoo_room_type_id found, skipping")
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

      // Costruisco la mappa room_type_uuid -> total_rooms da passare al mapper.
      // Serve in mapAvailability come fallback quando Scidoo manda
      // available=0 + occupied=0 (giorno tutto bloccato): senza questa mappa
      // il mapper scriverebbe total_rooms=0 e la capacita' "sparirebbe" dalla
      // dashboard (vedi incident Moriano 23/05/2026).
      const roomTypeCapacityMap = new Map<string, number>()
      for (const rt of roomTypes || []) {
        if (rt.id && typeof rt.total_rooms === "number") {
          roomTypeCapacityMap.set(rt.id, rt.total_rooms)
        }
      }

      const mapper = new ScidooMapper(this.hotelId, mappings, undefined, undefined, roomTypeCapacityMap)

      // Step 2: Load unprocessed raw availability from Supabase scidoo_raw_availability
      // DRAIN LOOP (20/07/2026): storicamente si processava UNA sola pagina di
      // 1000 righe per run (ORDER BY synced_at). Con un backlog grande — es.
      // Barronci dopo un full resync che azzera `processed` su tutto il range
      // 2024→2027 (2300+ righe non processate) — le 1000 righe venivano
      // consumate da date vecchie mentre le date NEAR-TERM (oggi) restavano non
      // processate all'infinito: daily_availability restava sui vecchi dati
      // `pms` e la dashboard mostrava camere "libere" in realtà vendute. Ora
      // cicliamo finché il backlog non è svuotato, con cap iterazioni + budget
      // tempo. Ordiniamo per `date` così le date passate/near-term vengono
      // processate in ordine cronologico deterministico (tie-break su id).
      console.log("[v0] ETL: Step 2 - Loading unprocessed raw availability from Supabase...")
      const activeScidooIds = mappings.map((m) => m.scidoo_room_type_id)
      const FETCH_LIMIT = 1000
      const MAX_ITERATIONS = 40 // cap di sicurezza: ~40k righe per run
      const TIME_BUDGET_MS = 45000 // stop prima del maxDuration del cron; il resto riprende al run successivo

      // PRIORITA' NEAR-TERM (20/07/2026): la disponibilità delle date passate
      // NON cambia mai, ma se ordinassimo tutto il backlog per `date ASC`
      // partiremmo dal 2024 e — esaurito il budget di tempo — le date di OGGI
      // resterebbero di nuovo non processate (dashboard stale). Quindi drenamo
      // in DUE FASI con budget di tempo CONDIVISO:
      //   FASE 1 "near"  = date >= ieri, ordinate ASC  -> oggi + futuro PRIMA;
      //   FASE 2 "past"  = date <  ieri, ordinate DESC -> storico dal recente
      //                    all'indietro (rispetta "tutto lo storico").
      // Cosi' la dashboard (oggi+futuro) e' SEMPRE aggiornata a fine run, anche
      // se lo storico lontano viene completato nei run successivi.
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 1) // ieri, per un margine di sicurezza
      const cutoffIso = cutoff.toISOString().split("T")[0]
      const phases: Array<{ name: string; ascending: boolean; near: boolean }> = [
        { name: "near-term", ascending: true, near: true },
        { name: "storico", ascending: false, near: false },
      ]
      let iteration = 0
      let timeBudgetHit = false

      for (const phase of phases) {
        if (timeBudgetHit) break
        while (iteration < MAX_ITERATIONS) {
          iteration++
          if (Date.now() - startTime > TIME_BUDGET_MS) {
            console.warn(
              `[v0] ETL: availability drain interrotto per time budget in fase "${phase.name}" dopo ${iteration - 1} iterazioni (backlog residuo ripreso al prossimo run)`,
            )
            timeBudgetHit = true
            break
          }

          let query = supabase
            .from("scidoo_raw_availability")
            .select("*")
            .eq("hotel_id", this.hotelId)
            .eq("processed", false)
            .in("scidoo_room_type_id", activeScidooIds)
          query = phase.near ? query.gte("date", cutoffIso) : query.lt("date", cutoffIso)
          const { data: rawAvailability, error: rawError } = await query
            .order("date", { ascending: phase.ascending })
            .order("id", { ascending: true })
            .limit(FETCH_LIMIT)

          if (rawError) {
            throw new Error(`Failed to load raw availability: ${rawError.message}`)
          }

          console.log(
            `[v0] ETL: fase "${phase.name}" iterazione ${iteration} - ${rawAvailability?.length || 0} righe availability non processate`,
          )

          if (!rawAvailability || rawAvailability.length === 0) {
            break // fase svuotata, passa alla successiva
          }

      // Step 3: Batch process all raw records -> normalized -> bulk upsert into canonical tables
      console.log("[v0] ETL: Step 3 - Batch processing availability records...")
      
      const dailyAvailBatch: any[] = []
      const processedIds: string[] = []
      const failedIds: { id: string; error: string }[] = []

      for (const rawAvail of rawAvailability || []) {
        recordsProcessed++

        try {
          const rawData = rawAvail.raw_data as Record<string, any> || {}
          const mapperInput = {
            room_type_id: String(rawAvail.scidoo_room_type_id),
            date: rawAvail.date,
            available_count: Number(rawData.available_count) || 0,
            occupied_count: Number(rawData.occupied_count) || 0,
            total_rooms: roomTypeTotalRooms[String(rawAvail.scidoo_room_type_id)] || 0,
            rooms_out_of_service: Number(rawData.rooms_out_of_service) || 0,
          }

          const normalizedAvailability = mapper.mapAvailability(mapperInput)

          if (!normalizedAvailability.room_type_id) {
            recordsFailed++
            failedIds.push({ id: rawAvail.id, error: `Room type ${rawAvail.scidoo_room_type_id} not mapped` })
            continue
          }

          dailyAvailBatch.push({ ...normalizedAvailability, updated_at: new Date().toISOString() })
          processedIds.push(rawAvail.id)
        } catch (error) {
          recordsFailed++
          failedIds.push({ id: rawAvail.id, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }

      // FIX (28/04/2026): hard guard contro orfani room_type_id=NULL.
      // Anche se mapAvailability() già filtra in alto, accettiamo SOLO record
      // con room_type_id valido qui. Questo evita di inquinare le tabelle
      // canoniche con record inutilizzabili in caso di regressioni future del
      // mapper o di mapping mancanti scoperti dopo il check iniziale.
      const validBatch = dailyAvailBatch.filter(r => !!r.room_type_id)
      const droppedNull = dailyAvailBatch.length - validBatch.length
      if (droppedNull > 0) {
        console.warn(`[v0] ETL: Dropped ${droppedNull} availability records with null room_type_id (defensive guard)`)
        recordsFailed += droppedNull
      }
      console.log(`[v0] ETL: Mapped ${validBatch.length} records, ${failedIds.length} failed. Upserting in batches...`)

      // Batch upsert daily_availability + rms_availability_daily (chunks of 500).
      // Le due tabelle sono SEPARATE (NON una vista come indicato in un vecchio
      // commento errato): daily_availability è scritta dall'ETL e dal cron, mentre
      // rms_availability_daily è la sorgente letta dalla pagina Pricing e dalla
      // dashboard. Storicamente erano allineate solo se passava il workaround
      // manuale `/api/dati/fix-room-type-etl`. Ora la sincronizzazione è automatica.
      const BATCH_SIZE = 500
      for (let i = 0; i < validBatch.length; i += BATCH_SIZE) {
        const chunk = validBatch.slice(i, i + BATCH_SIZE)
        try {
          await this.retryWithBackoff(async () => {
            const { error } = await supabase
              .from("daily_availability")
              .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
            if (error) throw error
          })
          // Mirror anche in rms_availability_daily — payload identico, stessa
          // unique key. Se questo fallisce non bloccchiamo l'ETL, ma logghiamo
          // chiaramente perché senza questa scrittura la pagina Pricing si svuota.
          try {
            await this.retryWithBackoff(async () => {
              const { error } = await supabase
                .from("rms_availability_daily")
                .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
              if (error) throw error
            })
          } catch (rmsError) {
            console.error("[v0] ETL: rms_availability_daily mirror error:", rmsError)
          }
          recordsInserted += chunk.length
          console.log(`[v0] ETL: availability batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Math.min(i + BATCH_SIZE, validBatch.length)}/${validBatch.length}`)
        } catch (error) {
          console.error("[v0] ETL: daily_availability batch error:", error)
          recordsFailed += chunk.length
          recordsInserted -= chunk.length
        }
      }

      // Batch mark processed (chunks of 500)
      for (let i = 0; i < processedIds.length; i += BATCH_SIZE) {
        const chunk = processedIds.slice(i, i + BATCH_SIZE)
        await this.retryWithBackoff(async () => {
          await supabase
            .from("scidoo_raw_availability")
            .update({ processed: true, processed_at: new Date().toISOString() })
            .in("id", chunk)
        })
      }

      // Batch mark failed
      for (const failed of failedIds) {
        await supabase
          .from("scidoo_raw_availability")
          .update({ processed: true, processed_at: new Date().toISOString(), processing_error: failed.error })
          .eq("id", failed.id)
      }

      // Log errors in bulk
      if (failedIds.length > 0) {
        const errorRows = failedIds.map(f => ({
          etl_job_id: this.etlJobId,
          source_table: "scidoo_raw_availability",
          source_record_id: f.id,
          target_table: "daily_availability",
          error_type: "mapping",
          error_message: f.error,
        }))
        await supabase.from("etl_errors").insert(errorRows).catch(() => {})
      }

        // Se la pagina è più piccola del limite, la fase è esaurita: esci dal
        // while ed eventualmente passa alla fase successiva (storico).
        if (rawAvailability.length < FETCH_LIMIT) {
          break
        }
        } // fine while (drain di una fase)
      } // fine for (fasi near-term -> storico)

      console.log("[v0] ETL: Availability processing complete", {
        processed: recordsProcessed,
        inserted: recordsInserted,
        updated: recordsUpdated,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] ETL: Availability processor error:", errorMessage)
      console.error("[v0] ETL: Full error:", error)
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
