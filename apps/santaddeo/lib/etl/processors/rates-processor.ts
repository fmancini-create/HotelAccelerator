// ETL Processor for Rates
// Transforms raw rates from connectors schema to public.daily_rates

import { createServiceRoleClient } from "@/lib/supabase/server"
import type { ETLResult } from "../types"

export class RatesProcessor {
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
    let recordsUpdated = 0
    const recordsSkipped = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      console.log("[v0] ETL: Starting rates processing for hotel", this.hotelId)

      // Get unprocessed raw rates from public schema
      const { data: rawRates, error: fetchError } = await supabase
        .from("scidoo_raw_rates")
        .select("*")
        .eq("hotel_id", this.hotelId)
        .eq("processed", false)
        .order("synced_at", { ascending: true })
        .limit(1000) // Process in batches

      if (fetchError) {
        throw new Error(`Failed to fetch raw rates: ${fetchError.message}`)
      }

      console.log("[v0] ETL: Found", rawRates?.length || 0, "unprocessed rates")

      for (const rawRate of rawRates || []) {
        recordsProcessed++

        try {
          const rateData = rawRate.raw_data

          // Transform to daily_rates format
          const normalizedRate = {
            hotel_id: this.hotelId,
            date: rateData.date,
            room_type_id: rateData.room_type_id,
            rate_plan_id: rateData.rate_plan_id || null,
            base_price: Number.parseFloat(rateData.price || 0),
            currency: rateData.currency || "EUR",
            min_stay: rateData.min_stay || null,
            max_stay: rateData.max_stay || null,
            closed_to_arrival: rateData.closed_to_arrival || false,
            closed_to_departure: rateData.closed_to_departure || false,
            pms_rate_id: rateData.rate_id || null,
            raw_data: rateData,
          }

          // Check if rate already exists for this date and room type
          const { data: existing } = await supabase
            .from("daily_rates")
            .select("id")
            .eq("hotel_id", this.hotelId)
            .eq("date", normalizedRate.date)
            .eq("room_type_id", normalizedRate.room_type_id)
            .single()

          if (existing) {
            // Update existing rate
            const { error: updateError } = await supabase
              .from("daily_rates")
              .update({
                ...normalizedRate,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id)

            if (updateError) {
              throw updateError
            }
            recordsUpdated++
          } else {
            // Insert new rate
            const { error: insertError } = await supabase.from("daily_rates").insert(normalizedRate)

            if (insertError) {
              throw insertError
            }
            recordsInserted++
          }

          // Mark raw rate as processed
          await supabase
            .from("scidoo_raw_rates")
            .update({
              processed: true,
              processed_at: new Date().toISOString(),
            })
            .eq("id", rawRate.id)
        } catch (error) {
          recordsFailed++
          console.error("[v0] ETL: Error processing rate", rawRate.id, error)

          // Log error
          await supabase.from("etl_errors").insert({
            etl_job_id: this.etlJobId,
            source_table: "scidoo_raw_rates",
            source_record_id: rawRate.id,
            target_table: "daily_rates",
            error_type: "mapping",
            error_message: error instanceof Error ? error.message : "Unknown error",
            error_details: { error: String(error) },
            raw_data: rawRate.raw_data,
          })

          // Mark as processed with error
          await supabase
            .from("scidoo_raw_rates")
            .update({
              processed: true,
              processed_at: new Date().toISOString(),
              processing_error: error instanceof Error ? error.message : "Unknown error",
            })
            .eq("id", rawRate.id)
        }
      }

      console.log("[v0] ETL: Rates processing complete", {
        processed: recordsProcessed,
        inserted: recordsInserted,
        updated: recordsUpdated,
        failed: recordsFailed,
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] ETL: Rates processor error:", errorMessage)
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
