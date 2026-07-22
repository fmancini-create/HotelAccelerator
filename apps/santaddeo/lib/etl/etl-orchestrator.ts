// ETL Orchestrator
// Manages the complete ETL process from connectors to public schema
// ARCHITECTURE RULE: ETL is BLOCKED if mapping is not VALIDATED/LOCKED

import { createServiceRoleClient } from "@/lib/supabase/server"
import { BookingsProcessor } from "./processors/bookings-processor"
import { AvailabilityProcessor } from "./processors/availability-processor"
import { RatesProcessor } from "./processors/rates-processor"
import { ProductionProcessor } from "./processors/production-processor"
import { triggerPriceRecalculation } from "@/lib/pricing/auto-trigger"
import { processPendingPricingQueue } from "@/lib/pricing/process-queue"
import { triggerAvailabilitySyncForDates } from "@/lib/sync/availability-sync-trigger"
import { markSyncCompleted } from "@/lib/sync/data-freshness"
import type { ETLJobConfig, ETLResult } from "./types"

export class ETLOrchestrator {
  private config: ETLJobConfig

  constructor(config: ETLJobConfig) {
    this.config = config
  }

  /**
   * Fallback range per l'event-driven availability trigger quando il job non
   * specifica date_from/date_to. Strategia conservativa: copre l'orizzonte
   * pricing tipico (oggi → +18 mesi). Cosi' qualsiasi prenotazione futura
   * impatta sull'availability che il pricing legge.
   */
  private computeDefaultRange(): { dateFrom: string; dateTo: string } {
    const today = new Date()
    const dateFrom = today.toISOString().split("T")[0]
    const future = new Date(today)
    future.setMonth(future.getMonth() + 18)
    const dateTo = future.toISOString().split("T")[0]
    return { dateFrom, dateTo }
  }

  async run(): Promise<{
    job_id: string
    results: Record<string, ETLResult>
    blocked?: boolean
    block_reason?: string
  }> {
    const supabase = await createServiceRoleClient()

    console.log("[v0] ETL: Starting orchestrator for hotel", this.config.hotel_id)

    // ARCHITECTURE RULE: Check can_run_etl BEFORE any operation
    // This is the SINGLE GATE for all ETL operations
    try {
      const { data: canRunResult, error: canRunError } = await supabase.rpc("can_run_etl", {
        p_hotel_id: this.config.hotel_id,
      })

      if (canRunError) {
        // If function doesn't exist, log warning but continue (legacy mode)
        console.warn("[v0] ETL Guard: can_run_etl function not found, running in legacy mode")
      } else if (canRunResult && !canRunResult.can_run) {
        console.warn("[v0] ETL BLOCKED:", canRunResult.block_reasons)

        // Log the block
        await supabase
          .from("etl_block_log")
          .insert({
            hotel_id: this.config.hotel_id,
            operation: "etl_run",
            block_reason: canRunResult.block_reasons?.join("; ") || "Unknown",
            blocked_at: new Date().toISOString(),
          })
          .catch(() => {
            // Ignore if table doesn't exist
          })

        return {
          job_id: "",
          results: {},
          blocked: true,
          block_reason: canRunResult.block_reasons?.join("; ") || "Mapping o binding non validi",
        }
      }
    } catch (guardError) {
      // If guard fails completely, log and continue in legacy mode
      console.warn("[v0] ETL Guard check failed, running in legacy mode:", guardError)
    }

    const { data: job, error: jobError } = await supabase
      .from("etl_jobs")
      .insert({
        hotel_id: this.config.hotel_id,
        job_type: this.config.job_type,
        date_from: this.config.date_from || null,
        date_to: this.config.date_to || null,
        status: "running",
        triggered_by: this.config.triggered_by || "manual",
        triggered_by_user: this.config.triggered_by_user || null,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (jobError || !job) {
      throw new Error(`Failed to create ETL job: ${jobError?.message}`)
    }

    const results: Record<string, ETLResult> = {}
    let overallSuccess = true

    try {
      // Process based on job type
      if (this.config.job_type === "bookings" || this.config.job_type === "full_sync") {
        const processor = new BookingsProcessor(this.config.hotel_id, job.id)
        results.bookings = await processor.process()
        if (!results.bookings.success) overallSuccess = false
        else {
          // Freshness tracker (12/05/2026): observability per /api/dati/freshness.
          markSyncCompleted(this.config.hotel_id, "bookings").catch(() => {})
        }
      }

      // EVENT-DRIVEN AVAILABILITY SYNC (12/05/2026 sera tardi):
      // Se il job era SOLO bookings (non un full_sync che gia' processa
      // availability come step successivo) e c'e' stato almeno un record
      // bookings inserito/aggiornato, triggeriamo un sync availability MIRATO
      // sul range date del job. Cosi' la pagina disponibilita' e il pricing
      // vedono i conteggi camere aggiornati entro pochi secondi dall'arrivo
      // della prenotazione, invece di aspettare il cron schedulato (6h default).
      //
      // REGOLA SACRA RISPETTATA: il sync chiede al PMS (Scidoo) l'availability
      // ufficiale per quel range, NON deriva da bookings locali. Cosi' allotment,
      // stop sell, blocchi OTA, maintenance restano integri.
      const isBookingsOnlyJob = this.config.job_type === "bookings"
      const bookingsAffected =
        (results.bookings?.records_inserted ?? 0) +
        (results.bookings?.records_updated ?? 0)
      if (isBookingsOnlyJob && results.bookings?.success && bookingsAffected > 0) {
        const dateFrom = this.config.date_from || this.computeDefaultRange().dateFrom
        const dateTo = this.config.date_to || this.computeDefaultRange().dateTo
        console.log(
          `[v0] ETL: bookings affected (${bookingsAffected}), triggering event-driven availability sync for hotel ${this.config.hotel_id} range ${dateFrom}..${dateTo}`
        )
        try {
          const availTriggerResult = await triggerAvailabilitySyncForDates({
            hotelId: this.config.hotel_id,
            dateFrom,
            dateTo,
            triggeredBy: `etl-orchestrator:bookings-only:${this.config.triggered_by || "unknown"}`,
          })
          console.log("[v0] ETL: event-driven availability sync result:", availTriggerResult)
        } catch (err) {
          console.error("[v0] ETL: event-driven availability sync error (non-blocking):", err)
        }
      }

      if (this.config.job_type === "availability" || this.config.job_type === "full_sync") {
        const processor = new AvailabilityProcessor(this.config.hotel_id, job.id)
        results.availability = await processor.process()
        if (!results.availability.success) overallSuccess = false
        else {
          markSyncCompleted(this.config.hotel_id, "availability").catch(() => {})
        }
      }

      if (this.config.job_type === "rates" || this.config.job_type === "full_sync") {
        const processor = new RatesProcessor(this.config.hotel_id, job.id)
        results.rates = await processor.process()
        if (!results.rates.success) overallSuccess = false
        else {
          markSyncCompleted(this.config.hotel_id, "rates").catch(() => {})
        }
      }

      if (this.config.job_type === "production" || this.config.job_type === "full_sync") {
        const processor = new ProductionProcessor(this.config.hotel_id, job.id)
        results.production = await processor.process()
        if (!results.production.success) overallSuccess = false
        else {
          markSyncCompleted(this.config.hotel_id, "production").catch(() => {})
        }
      }

      // Calculate totals
      const totals = Object.values(results).reduce(
        (acc, result) => ({
          records_processed: acc.records_processed + result.records_processed,
          records_inserted: acc.records_inserted + result.records_inserted,
          records_updated: acc.records_updated + result.records_updated,
          records_skipped: acc.records_skipped + result.records_skipped,
          records_failed: acc.records_failed + result.records_failed,
        }),
        {
          records_processed: 0,
          records_inserted: 0,
          records_updated: 0,
          records_skipped: 0,
          records_failed: 0,
        },
      )

      // Collect error messages from failed processors
      const errorMessages = Object.entries(results)
        .filter(([, r]) => !r.success && r.error_message)
        .map(([name, r]) => `${name}: ${r.error_message}`)
        .join("; ")

      await supabase
        .from("etl_jobs")
        .update({
          status: overallSuccess ? "completed" : "failed",
          error_message: errorMessages || null,
          ...totals,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - new Date(job.started_at).getTime(),
        })
        .eq("id", job.id)

      console.log("[v0] ETL: Orchestrator completed", { job_id: job.id, results })

      // AGNOSTIC PRICE TRIGGER: After bookings or availability are processed,
      // automatically trigger price recalculation if Autopilot is enabled.
      // This works with ANY connector (Scidoo, GSheets, future PMS, etc.)
      const shouldTriggerPrices = 
        overallSuccess && 
        (results.bookings?.success || results.availability?.success)

      if (shouldTriggerPrices) {
        console.log("[v0] ETL: Triggering price recalculation for hotel", this.config.hotel_id)
        try {
          const triggerResult = await triggerPriceRecalculation(this.config.hotel_id)
          console.log("[v0] ETL: Price trigger result:", triggerResult)
        } catch (err) {
          // Log but don't fail the ETL job if price trigger fails
          console.error("[v0] ETL: Price trigger error (non-blocking):", err)
        }

        // INLINE QUEUE DRAIN (04/05/2026 - issue "autopilot non pusha subito").
        // triggerPriceRecalculation enqueues a pending row in
        // pricing_recalc_queue. Historically that queue was drained ONLY by
        // the sync-and-etl cron every 15 minutes (the per-minute cron in
        // vercel.json gets dropped on Vercel Pro). Conseguenza: tra l'arrivo
        // di un booking e il push autopilot al PMS passavano fino a 15min.
        // Drenando la queue qui inline subito dopo l'enqueue, ogni nuova
        // prenotazione importata dall'ETL produce push + email entro pochi
        // secondi. Filtro per hotelId per non interferire con altre code.
        // Try-catch silenzioso: se fallisce, il drain delle 15min ripiglia.
        console.log("[v0] ETL: Draining pricing queue inline for hotel", this.config.hotel_id)
        try {
          const drainResult = await processPendingPricingQueue({
            hotelId: this.config.hotel_id,
            maxItems: 5,
          })
          console.log("[v0] ETL: Inline queue drain result:", {
            processed: drainResult.processed,
            succeeded: drainResult.succeeded,
            failed: drainResult.failed,
          })
        } catch (err) {
          console.error("[v0] ETL: Inline queue drain error (non-blocking, fallback to 15min cron):", err)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] ETL: Orchestrator error:", errorMessage)

      // Update job with error
      await supabase
        .from("etl_jobs")
        .update({
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - new Date(job.started_at).getTime(),
        })
        .eq("id", job.id)

      throw error
    }

    return { job_id: job.id, results }
  }
}
