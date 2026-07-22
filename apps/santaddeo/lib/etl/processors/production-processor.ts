// ETL Processor for Production (Revenue, ADR, RevPAR)
// Transforms raw fiscal production (invoices/deposits) from scidoo_raw_fiscal_production_legacy
// into aggregated daily revenue in the canonical daily_production table.
//
// RAW data format (scidoo_raw_fiscal_production_legacy):
//   - Each row is a FISCAL DOCUMENT (invoice or deposit)
//   - Fields: date, document_type, total (numeric), account_revenues (JSONB array)
//   - account_revenues example: [{code: "Pernott", name: "Pernottamenti", value: 57.73}, {code: "Spa", name: "SPA", value: 45.45}]
//
// TARGET format (daily_production):
//   - Each row is an AGGREGATED DAY with total_revenue, adr, revpar, etc.
//   - We SUM all invoice totals for the same date

import { createServiceRoleClient } from "@/lib/supabase/server"
import type { ETLResult } from "../types"

export class ProductionProcessor {
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
    let recordsSkipped = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      console.log("[ProductionProcessor] Starting for hotel", this.hotelId)

      // Step 1: Load raw Scidoo fiscal production from the legacy table (which has data)
      // The raw_data JSONB contains documents with breakdown per department
      // Note: connectors.scidoo_raw_fiscal_production is empty, using legacy table
      const { data: rawRecords, error: rawError } = await supabase
        .from("scidoo_raw_fiscal_production_legacy")
        .select("id, date, raw_data")
        .eq("hotel_id", this.hotelId)
        .order("date", { ascending: true })
        .limit(500)

      if (rawError) {
        throw new Error(`Failed to load raw fiscal production: ${rawError.message}`)
      }

      if (!rawRecords || rawRecords.length === 0) {
        console.log("[ProductionProcessor] No unprocessed records found")
        return {
          success: true,
          records_processed: 0,
          records_inserted: 0,
          records_updated: 0,
          records_skipped: 0,
          records_failed: 0,
          duration_ms: Date.now() - startTime,
        }
      }

      console.log("[TRACE-ETL-PRODUCTION] rawRecords count:", rawRecords.length)
      // TRACE: log first 3 raw records to see structure
      for (const raw of rawRecords.slice(0, 3)) {
        console.log("[TRACE-ETL-PRODUCTION] Sample raw record:", {
          id: raw.id,
          date: raw.date,
          raw_data_keys: Object.keys(raw.raw_data || {}),
          documents_count: (raw.raw_data as any)?.documents?.length || 0,
          account_revenues_count: (raw.raw_data as any)?.account_revenues?.length || 0,
          total_revenue: (raw.raw_data as any)?.total_revenue,
        })
      }
      console.log("[ProductionProcessor] Found", rawRecords.length, "unprocessed records")

      // Step 2: Get total rooms for RevPAR calculation
      const { data: roomTypes } = await supabase
        .from("room_types")
        .select("total_rooms")
        .eq("hotel_id", this.hotelId)
        .eq("is_active", true)

      const totalAvailableRooms = (roomTypes || []).reduce((sum, rt) => sum + (rt.total_rooms || 0), 0)

      // Step 3: Aggregate raw fiscal documents by date
      // Extract data from raw_data JSONB which contains documents array
      const dailyAggregates = new Map<string, {
        totalRevenue: number
        accommodationRevenue: number
        otherRevenue: number
        invoiceCount: number
        feeCount: number
        documentBreakdown: Map<string, number> // document_type -> total
        rawIds: string[]
      }>()

      for (const raw of rawRecords) {
        recordsProcessed++
        const date = raw.date
        if (!date) {
          recordsSkipped++
          continue
        }

        const rawData = raw.raw_data as any || {}
        const documents = rawData.documents || []
        const accountRevenues = rawData.account_revenues || [] // Department breakdown from Scidoo (with 's' - matches schema)

        if (!Array.isArray(documents) || documents.length === 0) {
          recordsSkipped++
          if (!dailyAggregates.has(date)) {
            dailyAggregates.set(date, {
              totalRevenue: 0,
              accommodationRevenue: 0,
              otherRevenue: 0,
              invoiceCount: 0,
              feeCount: 0,
              documentBreakdown: new Map(),
              rawIds: [],
            })
          }
          dailyAggregates.get(date)!.rawIds.push(raw.id)
          continue
        }

        if (!dailyAggregates.has(date)) {
          dailyAggregates.set(date, {
            totalRevenue: 0,
            accommodationRevenue: 0,
            otherRevenue: 0,
            invoiceCount: 0,
            feeCount: 0,
            documentBreakdown: new Map(),
            rawIds: [],
          })
        }

        const agg = dailyAggregates.get(date)!
        agg.rawIds.push(raw.id)

        // Process each document in raw_data
        for (const doc of documents) {
          const docType = String(doc.type || doc.document_type || "invoice").toLowerCase()
          const total = Number(doc.total || rawData.total_revenue || 0) || 0
          
          if (total <= 0) continue

          // Track document type breakdown
          if (!agg.documentBreakdown.has(docType)) {
            agg.documentBreakdown.set(docType, 0)
          }
          agg.documentBreakdown.set(docType, (agg.documentBreakdown.get(docType) || 0) + total)

          agg.totalRevenue += total

          if (docType === "fee") {
            agg.feeCount++
            agg.otherRevenue += total
          } else {
            // invoice, suspended_invoice, deposit
            if (docType === "invoice") {
              agg.invoiceCount++
            }
            
            // Use account_revenue breakdown from Scidoo (if available)
            // account_revenue is an array at the top level: [{ "name": "2345", "value": 81.97 }, ...]
            if (Array.isArray(accountRevenues) && accountRevenues.length > 0) {
              // We have department breakdown
              for (const ar of accountRevenues) {
                const name = String(ar.name || "").toLowerCase()
                const value = Number(ar.value) || 0

                // Accommodation revenue codes from Scidoo
                if (
                  name === "pernott" ||
                  name === "pernottamenti" ||
                  name.includes("pernottament") ||
                  name.includes("accommodation") ||
                  name.includes("soggiorn") ||
                  name.includes("camera") ||
                  name.includes("room")
                ) {
                  agg.accommodationRevenue += value
                } else {
                  agg.otherRevenue += value
                }
              }
            } else {
              // No breakdown - count everything as accommodation
              agg.accommodationRevenue += total
            }
          }
        }
      }

      console.log("[ProductionProcessor] Aggregated into", dailyAggregates.size, "daily records")
      
      // TRACE: log daily aggregates to see what goes into daily_production
      for (const [date, agg] of dailyAggregates) {
        console.log("[TRACE-ETL-PRODUCTION] Daily aggregate:", {
          date,
          totalRevenue: agg.totalRevenue.toFixed(2),
          accommodationRevenue: agg.accommodationRevenue.toFixed(2),
          otherRevenue: agg.otherRevenue.toFixed(2),
          invoiceCount: agg.invoiceCount,
          feeCount: agg.feeCount,
          documentTypes: Array.from(agg.documentBreakdown.entries()).map(([t, v]) => `${t}:${v.toFixed(2)}`),
        })
      }

      // Step 4: Upsert aggregated data into daily_production
      const allRawIds: string[] = []

      for (const [date, agg] of dailyAggregates) {
        if (agg.totalRevenue <= 0 && agg.invoiceCount === 0 && agg.feeCount === 0) {
          allRawIds.push(...agg.rawIds)
          continue
        }

        try {
          // Check if booking ETL already wrote occupancy data for this date
          const { data: existing } = await supabase
            .from("daily_production")
            .select("total_rooms, rooms_occupied, rooms_available, source")
            .eq("hotel_id", this.hotelId)
            .eq("date", date)
            .maybeSingle()

          const roomsOccupied = existing?.rooms_occupied || 0
          const totalRooms = existing?.total_rooms || totalAvailableRooms || 0
          const roomsAvailable = existing?.rooms_available || Math.max(totalRooms - roomsOccupied, 0)

          // Calculate KPIs
          const adr = roomsOccupied > 0
            ? Math.round((agg.accommodationRevenue / roomsOccupied) * 100) / 100
            : 0
          const revpar = totalRooms > 0
            ? Math.round((agg.accommodationRevenue / totalRooms) * 100) / 100
            : 0
          const occupancyRate = totalRooms > 0
            ? Math.round((roomsOccupied / totalRooms) * 10000) / 100
            : 0

          const record = {
            hotel_id: this.hotelId,
            date,
            total_revenue: Math.round(agg.totalRevenue * 100) / 100,
            direct_revenue: Math.round(agg.accommodationRevenue * 100) / 100,
            intermediated_revenue: Math.round(agg.otherRevenue * 100) / 100,
            adr,
            revpar,
            occupancy_rate: occupancyRate || null,
            total_rooms: totalRooms,
            rooms_occupied: roomsOccupied,
            rooms_available: roomsAvailable,
            source: existing?.source === "booking_etl" ? "booking_etl+scidoo" : "scidoo",
            calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          const { error: upsertError } = await supabase
            .from("daily_production")
            .upsert(record, { onConflict: "hotel_id,date" })

          if (upsertError) {
            console.error(`[ProductionProcessor] Upsert error for ${date}:`, upsertError.message)
            recordsFailed++
            errorMessage = upsertError.message
          } else {
            recordsInserted++
          }

          // Also populate rms_department_revenue with document type breakdown
          for (const [docType, revenue] of agg.documentBreakdown) {
            const { error: deptError } = await supabase
              .from("rms_department_revenue")
              .upsert(
                {
                  hotel_id: this.hotelId,
                  date,
                  department_name: "Fatturato Generale",
                  revenue: Math.round(revenue * 100) / 100,
                  document_type: docType,
                  document_count: 1,
                  taxable_amount: Math.round(revenue * 100) / 100,
                  source: "scidoo",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "hotel_id,date,department_name,document_type" }
              )

            if (deptError) {
              console.warn(`[ProductionProcessor] Error populating department revenue for ${date}/${docType}:`, deptError.message)
            }
          }

          allRawIds.push(...agg.rawIds)
        } catch (err) {
          recordsFailed++
          errorMessage = err instanceof Error ? err.message : String(err)
          console.error(`[ProductionProcessor] Error for ${date}:`, errorMessage)
          // Still collect raw IDs so we don't retry forever
          allRawIds.push(...agg.rawIds)
        }
      }

      // Step 5: Mark raw records as processed (they're already marked by the sync anyway)
      // We just log completion
      console.log("[ProductionProcessor] Completed processing fiscal production data")

      console.log("[ProductionProcessor] Completed:", {
        records_processed: recordsProcessed,
        records_inserted: recordsInserted,
        records_skipped: recordsSkipped,
        records_failed: recordsFailed,
      })

      return {
        success: recordsFailed === 0,
        records_processed: recordsProcessed,
        records_inserted: recordsInserted,
        records_updated: 0,
        records_skipped: recordsSkipped,
        records_failed: recordsFailed,
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      console.error("[ProductionProcessor] Fatal error:", errorMsg)

      return {
        success: false,
        records_processed: recordsProcessed,
        records_inserted: recordsInserted,
        records_updated: 0,
        records_skipped: recordsSkipped,
        records_failed: recordsFailed + 1,
        error_message: errorMsg,
        duration_ms: Date.now() - startTime,
      }
    }
  }
}
