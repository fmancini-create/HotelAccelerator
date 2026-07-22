// Scidoo Sync Module
// Fetches data from Scidoo API and stores it in the connectors schema

import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "./client"
import type { ScidooConfig, SyncResult } from "../types"

export class ScidooSync {
  private client: ScidooClient
  private hotelId: string
  private pmsIntegrationId: string

  constructor(config: ScidooConfig, hotelId: string, pmsIntegrationId: string) {
    this.client = new ScidooClient(config)
    this.hotelId = hotelId
    this.pmsIntegrationId = pmsIntegrationId
  }

  async syncBookings(dateFrom: string, dateTo: string): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsFetched = 0
    let recordsInserted = 0
    const recordsUpdated = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      // Fetch bookings from Scidoo API
      const bookings = await this.client.getBookings(dateFrom, dateTo)
      recordsFetched = bookings.length

      console.log("[v0] Scidoo sync: fetched", recordsFetched, "bookings")

      // Build scidoo_room_type_id -> room_type_name lookup
      const { data: roomTypesForLookup } = await supabase
        .from("room_types")
        .select("name,scidoo_room_type_id")
        .eq("hotel_id", this.hotelId)
      const scidooRtIdToName: Record<string, string> = {}
      for (const rt of roomTypesForLookup || []) {
        if (rt.scidoo_room_type_id) scidooRtIdToName[String(rt.scidoo_room_type_id)] = rt.name
      }

      // Insert/update raw bookings in connectors schema
      for (const booking of bookings) {
        try {
          // Skip bookings without checkin_date (required field)
          // These are typically incomplete/invalid bookings from Scidoo
          if (!booking.checkin_date) {
            console.log("[v0] Skipping booking without checkin_date:", booking.id)
            continue
          }

          // Calculate room-only total from daily_price
          let roomTotal = 0
          if (booking.daily_price && typeof booking.daily_price === "object") {
            roomTotal = Object.values(booking.daily_price).reduce((sum: number, v: any) => sum + (parseFloat(v) || 0), 0)
          }

          // Determine effective status and room type.
          // FIX 1 (2026-04): Status downgrade protection removed.
          // raw_data.status from Scidoo is always the source of truth.
          // Previously this code promoted "annullata" → "confermata" when
          // daily_price > 0 or last_modification > cancellation, causing
          // phantom revenue inflation. Now we only protect room_type_code
          // against the PMS data quality issue of sending room_type_id = "0".
          const effectiveStatus = booking.status
          let effectiveRoomTypeName = booking.room_type_name || booking.room_type || scidooRtIdToName[String(booking.room_type_id)] || null
          let effectiveRoomTypeCode = booking.room_type_id ? String(booking.room_type_id) : null

          if (effectiveStatus === "annullata" && roomTotal > 0) {
            // Only protect room_type_code if the incoming data sends "0" or null
            // but we already have a valid value in the DB for this booking.
            if (!effectiveRoomTypeCode || effectiveRoomTypeCode === "0") {
              const { data: existing } = await supabase
                .from("scidoo_raw_bookings")
                .select("room_type_name, room_type_code")
                .eq("hotel_id", this.hotelId)
                .eq("scidoo_booking_id", booking.id)
                .single()

              if (existing && existing.room_type_code && existing.room_type_code !== "0") {
                effectiveRoomTypeName = existing.room_type_name
                effectiveRoomTypeCode = existing.room_type_code
              }
            }
          }

          const { error } = await supabase.from("scidoo_raw_bookings").upsert(
            {
              hotel_id: this.hotelId,
              pms_integration_id: this.pmsIntegrationId,
              raw_data: booking,
              scidoo_booking_id: booking.id,
              scidoo_reservation_number: booking.reservation_number,
              booking_date: booking.booking_date || booking.creation?.split(" ")[0] || null,
              checkin_date: booking.checkin_date,
              checkout_date: booking.checkout_date,
              status: effectiveStatus,
              room_type_name: effectiveRoomTypeName,
              room_type_code: effectiveRoomTypeCode,
              total_amount: roomTotal || null,
              channel: booking.agency?.name || "Direct",
              rate_code: booking.rate_id ? String(booking.rate_id) : null,
              rate_name: booking.rate_name || null,
              guests_count: parseInt(booking.guest_count) || booking.guests?.length || null,
              adults_count: parseInt(booking.adult_count) || null,
              children_count: parseInt(booking.child_count) || null,
              customer_first_name: booking.customer?.first_name || null,
              customer_last_name: booking.customer?.last_name || null,
              customer_email: booking.customer?.email || null,
              customer_country: booking.customer?.citizenship || null,
              cancellation_date: booking.cancellation || null,
              synced_at: new Date().toISOString(),
              processed: false,
            },
            {
              onConflict: "hotel_id,scidoo_booking_id",
            },
          )

          if (error) {
            console.error("[v0] Error inserting booking:", error)
            recordsFailed++
          } else {
            recordsInserted++
          }
        } catch (err) {
          console.error("[v0] Exception inserting booking:", err)
          recordsFailed++
        }
      }

      // Log sync operation
      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "bookings",
        pms_name: "scidoo",
        endpoint: "/bookings/get.php",
        request_params: { date_from: dateFrom, date_to: dateTo },
        response_status: 200,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        status: recordsFailed === 0 ? "success" : "partial",
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Scidoo sync error:", errorMessage)

      // Log failed sync
      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "bookings",
        pms_name: "scidoo",
        endpoint: "/bookings/get.php",
        request_params: { date_from: dateFrom, date_to: dateTo },
        status: "failed",
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_fetched: recordsFetched,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }

  async syncAvailability(dateFrom: string, dateTo: string): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsFetched = 0
    let recordsInserted = 0
    const recordsUpdated = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      const availability = await this.client.getAvailability(dateFrom, dateTo)
      recordsFetched = availability.length

      console.log("[v0] Scidoo sync: fetched", recordsFetched, "availability records")

      for (const avail of availability) {
        try {
          const { error } = await supabase.from("scidoo_raw_availability").upsert(
            {
              hotel_id: this.hotelId,
              pms_integration_id: this.pmsIntegrationId,
              raw_data: avail,
              scidoo_room_type_id: avail.room_type_id,
              date: avail.date,
              rooms_available: avail.rooms_available,
              synced_at: new Date().toISOString(),
              processed: false,
            },
            {
              onConflict: "hotel_id,scidoo_room_type_id,date",
            },
          )

          if (error) {
            console.error("[v0] Error inserting availability:", error)
            recordsFailed++
          } else {
            recordsInserted++
          }
        } catch (err) {
          console.error("[v0] Exception inserting availability:", err)
          recordsFailed++
        }
      }

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "availability",
        pms_name: "scidoo",
        endpoint: "/rooms/getAvailability.php",
        request_params: { date_from: dateFrom, date_to: dateTo },
        response_status: 200,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        status: recordsFailed === 0 ? "success" : "partial",
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Scidoo sync error:", errorMessage)

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "availability",
        pms_name: "scidoo",
        endpoint: "/rooms/getAvailability.php",
        request_params: { date_from: dateFrom, date_to: dateTo },
        status: "failed",
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_fetched: recordsFetched,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }

  async syncRates(dateFrom: string, dateTo: string): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsFetched = 0
    let recordsInserted = 0
    const recordsUpdated = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      const rates = await this.client.getRates(dateFrom, dateTo)
      recordsFetched = rates.length

      console.log("[v0] Scidoo sync: fetched", recordsFetched, "rates")

      for (const rate of rates) {
        try {
          const { error } = await supabase.from("scidoo_raw_rates").upsert(
            {
              hotel_id: this.hotelId,
              pms_integration_id: this.pmsIntegrationId,
              raw_data: rate,
              scidoo_rate_id: rate.rate_id,
              scidoo_room_type_id: rate.room_type_id,
              date: rate.date,
              price: rate.price,
              synced_at: new Date().toISOString(),
              processed: false,
            },
            {
              onConflict: "hotel_id,scidoo_rate_id,scidoo_room_type_id,date",
            },
          )

          if (error) {
            console.error("[v0] Error inserting rate:", error)
            recordsFailed++
          } else {
            recordsInserted++
          }
        } catch (err) {
          console.error("[v0] Exception inserting rate:", err)
          recordsFailed++
        }
      }

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "rates",
        pms_name: "scidoo",
        endpoint: "/prices/getRates.php",
        request_params: { date_from: dateFrom, date_to: dateTo },
        response_status: 200,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        status: recordsFailed === 0 ? "success" : "partial",
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Scidoo sync error:", errorMessage)

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "rates",
        pms_name: "scidoo",
        endpoint: "/prices/getRates.php",
        request_params: { date_from: dateFrom, date_to: dateTo },
        status: "failed",
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_fetched: recordsFetched,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }

  async syncFiscalProduction(dateFrom: string, dateTo: string, vatNumber?: string): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsFetched = 0
    let recordsInserted = 0
    const recordsUpdated = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      const fiscalData = await this.client.getFiscalProduction(dateFrom, dateTo, vatNumber)

      // Flatten all document types, tagging each with its type
      const allDocs = [
        ...(fiscalData.tax_documents || []).map((d: any) => ({ ...d, type: "invoice" })),
        ...(fiscalData.fees || []).map((d: any) => ({ ...d, type: "fee" })),
        ...(fiscalData.suspended_invoices || []).map((d: any) => ({ ...d, type: "suspended_invoice" })),
        ...(fiscalData.deposits || []).map((d: any) => ({ ...d, type: "deposit" })),
      ]
      recordsFetched = allDocs.length

      console.log("[v0] Scidoo sync: fetched", recordsFetched, "fiscal documents (invoices:",
        (fiscalData.tax_documents || []).length, "fees:", (fiscalData.fees || []).length, ")")

      // Group documents by registration_date
      const byDate = new Map<string, any[]>()
      for (const doc of allDocs) {
        const regDate = doc.registration_date || doc.document_date
        if (!regDate) continue
        if (!byDate.has(regDate)) byDate.set(regDate, [])
        byDate.get(regDate)!.push(doc)
      }

      for (const [date, docs] of byDate) {
        try {
          const totalRevenue = docs
            .filter((d: any) => d.type === "invoice" || d.type === "fee")
            .reduce((sum: number, d: any) => sum + (parseFloat(d.total || d.taxable) || 0), 0)

          // Extract account_revenue breakdown from fiscalData if available
          // account_revenue is typically at the top level of the API response, aggregated per day
          const accountRevenues = fiscalData.account_revenue || []

          const { error } = await supabase.schema("connectors").from("scidoo_raw_fiscal_production").upsert(
            {
              hotel_id: this.hotelId,
              pms_integration_id: this.pmsIntegrationId,
              raw_data: {
                documents: docs,
                account_revenue: accountRevenues, // Add department/account breakdown at top level
                total_revenue: totalRevenue,
                invoices_count: docs.filter((d: any) => d.type === "invoice").length,
                fees_count: docs.filter((d: any) => d.type === "fee").length,
                deposits_count: docs.filter((d: any) => d.type === "deposit").length,
                suspended_count: docs.filter((d: any) => d.type === "suspended_invoice").length,
                sync_period: { from: dateFrom, to: dateTo },
              },
              date,
              total_revenue: totalRevenue,
              synced_at: new Date().toISOString(),
              processed: false,
            },
            {
              onConflict: "hotel_id,date",
            },
          )

          if (error) {
            console.error("[v0] Error inserting fiscal production:", error)
            recordsFailed++
          } else {
            recordsInserted++
          }
        } catch (err) {
          console.error("[v0] Exception inserting fiscal production:", err)
          recordsFailed++
        }
      }

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "fiscal_production",
        pms_name: "scidoo",
        endpoint: "/invoice/getFiscalProduction.php",
        request_params: { from: dateFrom, to: dateTo, vat_number: vatNumber },
        response_status: 200,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        status: recordsFailed === 0 ? "success" : "partial",
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Scidoo sync error:", errorMessage)

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "fiscal_production",
        pms_name: "scidoo",
        endpoint: "/invoice/getFiscalProduction.php",
        request_params: { from: dateFrom, to: dateTo, vat_number: vatNumber },
        status: "failed",
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_fetched: recordsFetched,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }

  async syncRoomTypes(): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsFetched = 0
    let recordsInserted = 0
    let recordsUpdated = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      const roomTypes = await this.client.getRoomTypes()
      recordsFetched = roomTypes.length

      console.log("[v0] Scidoo sync: fetched", recordsFetched, "room types")

      // Get existing room types to detect deletions
      const { data: existingRoomTypes } = await supabase
        .from("scidoo_raw_room_types")
        .select("scidoo_room_type_id")
        .eq("hotel_id", this.hotelId)

      const existingIds = new Set(existingRoomTypes?.map((rt) => rt.scidoo_room_type_id) || [])
      const fetchedIds = new Set(roomTypes.map((rt) => String(rt.id)))

      // Insert/update room types
      for (const roomType of roomTypes) {
        try {
          const { data: existing } = await supabase
            .from("scidoo_raw_room_types")
            .select("id")
            .eq("hotel_id", this.hotelId)
            .eq("scidoo_room_type_id", String(roomType.id))
            .single()

          const roomTypeData = {
            hotel_id: this.hotelId,
            pms_integration_id: this.pmsIntegrationId,
            raw_data: roomType,
            scidoo_room_type_id: String(roomType.id),
            name: roomType.name,
            description: roomType.description,
            size: roomType.size,
            capacity: roomType.capacity,
            capacity_default: roomType.capacity_default,
            additional_beds: roomType.additional_beds,
            rooms: roomType.rooms,
            active_flag: roomType.active_flag,
            synced_at: new Date().toISOString(),
            processed: false,
            updated_at: new Date().toISOString(),
          }

          if (existing) {
            const { error } = await supabase
              .from("scidoo_raw_room_types")
              .update(roomTypeData)
              .eq("id", existing.id)

            if (error) {
              console.error("[v0] Error updating room type:", error)
              recordsFailed++
            } else {
              recordsUpdated++
            }
          } else {
            const { error } = await supabase.from("scidoo_raw_room_types").insert(roomTypeData)

            if (error) {
              console.error("[v0] Error inserting room type:", error)
              recordsFailed++
            } else {
              recordsInserted++
            }
          }
        } catch (err) {
          console.error("[v0] Exception processing room type:", err)
          recordsFailed++
        }
      }

      // Soft delete room types that are no longer present
      const deletedIds = Array.from(existingIds).filter((id) => !fetchedIds.has(id))
      if (deletedIds.length > 0) {
        console.log("[v0] Soft deleting", deletedIds.length, "room types")
        const { error } = await supabase
          .from("scidoo_raw_room_types")
          .update({ active_flag: false, updated_at: new Date().toISOString() })
          .eq("hotel_id", this.hotelId)
          .in("scidoo_room_type_id", deletedIds)

        if (error) {
          console.error("[v0] Error soft deleting room types:", error)
        }
      }

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "room_types",
        pms_name: "scidoo",
        endpoint: "/rooms/getRoomTypes.php",
        response_status: 200,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        status: recordsFailed === 0 ? "success" : "partial",
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Scidoo sync error:", errorMessage)

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "room_types",
        pms_name: "scidoo",
        endpoint: "/rooms/getRoomTypes.php",
        status: "failed",
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_fetched: recordsFetched,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }

  async syncMinStay(dateFrom: string, dateTo: string): Promise<SyncResult> {
    const startTime = Date.now()
    const supabase = await createServiceRoleClient()

    let recordsFetched = 0
    let recordsInserted = 0
    const recordsUpdated = 0
    let recordsFailed = 0
    let errorMessage: string | undefined

    try {
      const minstayData = await this.client.getMinStay(dateFrom, dateTo)
      recordsFetched = minstayData.length

      console.log("[v0] Scidoo sync: fetched", recordsFetched, "minstay records")

      for (const minstay of minstayData) {
        try {
          const { error } = await supabase.from("scidoo_raw_minstay").upsert(
            {
              hotel_id: this.hotelId,
              pms_integration_id: this.pmsIntegrationId,
              raw_data: minstay,
              scidoo_room_type_id: String(minstay.room_type_id),
              scidoo_rate_id: String(minstay.rate_id),
              date: minstay.date,
              minstay: minstay.minstay,
              cta: minstay.cta,
              ctd: minstay.ctd,
              synced_at: new Date().toISOString(),
              processed: false,
            },
            {
              onConflict: "hotel_id,scidoo_room_type_id,scidoo_rate_id,date",
            },
          )

          if (error) {
            console.error("[v0] Error inserting minstay:", error)
            recordsFailed++
          } else {
            recordsInserted++
          }
        } catch (err) {
          console.error("[v0] Exception inserting minstay:", err)
          recordsFailed++
        }
      }

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "minstay",
        pms_name: "scidoo",
        endpoint: "/rooms/getMinstay.php",
        request_params: { start_date: dateFrom, end_date: dateTo },
        response_status: 200,
        records_fetched: recordsFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        status: recordsFailed === 0 ? "success" : "partial",
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Unknown error"
      console.error("[v0] Scidoo sync error:", errorMessage)

      await supabase.from("sync_logs").insert({
        hotel_id: this.hotelId,
        pms_integration_id: this.pmsIntegrationId,
        sync_type: "minstay",
        pms_name: "scidoo",
        endpoint: "/rooms/getMinstay.php",
        request_params: { start_date: dateFrom, end_date: dateTo },
        status: "failed",
        error_message: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
    }

    return {
      success: recordsFailed === 0 && !errorMessage,
      records_fetched: recordsFetched,
      records_inserted: recordsInserted,
      records_updated: recordsUpdated,
      records_failed: recordsFailed,
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    }
  }

  async syncAll(dateFrom: string, dateTo: string, vatNumber?: string): Promise<Record<string, SyncResult>> {
    console.log("[v0] Starting full Scidoo sync from", dateFrom, "to", dateTo)

    const results: Record<string, SyncResult> = {
      room_types: await this.syncRoomTypes(),
      bookings: await this.syncBookings(dateFrom, dateTo),
      availability: await this.syncAvailability(dateFrom, dateTo),
      rates: await this.syncRates(dateFrom, dateTo),
      minstay: await this.syncMinStay(dateFrom, dateTo),
    }

    if (vatNumber) {
      results.fiscal_production = await this.syncFiscalProduction(dateFrom, dateTo, vatNumber)
    }

    console.log("[v0] Scidoo sync completed:", results)

    return results
  }
}
