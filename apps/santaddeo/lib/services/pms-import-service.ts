import { createServiceRoleClient } from "@/lib/supabase/server"
import type { PMSBookingImport, PMSAvailabilityImport } from "@/lib/types/database"
import type { SyncJobCheckpoint } from "./sync-job-service"

interface RoomTypeCache {
  data: Map<string, string>
  timestamp: number
  hotelId: string
}

let roomTypeCache: RoomTypeCache | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Invalida la cache dei room types -- chiamare dopo aver creato nuove room_types
 * (es. GSheetsSyncService.ensureRoomTypes)
 */
export function invalidateRoomTypeCache() {
  roomTypeCache = null
}

/**
 * Service per importare dati dal PMS nel database SANTADDEO
 * Gestisce l'importazione di prenotazioni, disponibilità e calcolo automatico dei KPI
 */

export class PMSImportService {
  /**
   * Importa una lista di prenotazioni dal PMS con supporto per checkpoint
   */
  static async importBookings(
    hotelId: string,
    bookings: PMSBookingImport[],
    jobId?: string,
    startFromIndex = 0,
  ): Promise<{ success: number; errors: string[] }> {
    const supabase = await createServiceRoleClient()
    const errors: string[] = []
    let success = 0

    const now = Date.now()
    let roomTypeMap: Map<string, string>

    if (roomTypeCache && roomTypeCache.hotelId === hotelId && now - roomTypeCache.timestamp < CACHE_TTL) {
      console.log("[v0] Using cached room types:", roomTypeCache.data.size, "types")
      roomTypeMap = roomTypeCache.data
    } else {
      console.log("[v0] Loading room types cache for hotel:", hotelId)

      try {
        const { data: roomTypes, error: roomTypesError } = await supabase
          .from("room_types")
          .select("id, code, name, pms_room_type_id, scidoo_room_type_id")
          .eq("hotel_id", hotelId)

        if (roomTypesError) {
          const errorMessage = roomTypesError.message || String(roomTypesError)
          const isRateLimitError =
            errorMessage.includes("Too Many R") ||
            errorMessage.includes("Unexpected token") ||
            errorMessage.includes("not valid JSON") ||
            errorMessage.includes("SyntaxError")

          if (isRateLimitError) {
            if (roomTypeCache && roomTypeCache.hotelId === hotelId) {
              console.log("[v0] Rate limit detected, using stale cached room types:", roomTypeCache.data.size, "types")
              roomTypeMap = roomTypeCache.data
            } else {
              return { success: 0, errors: [`Database temporarily unavailable (rate limited), please try again`] }
            }
          } else {
            console.error("[v0] Error loading room types:", roomTypesError)
            return { success: 0, errors: [`Failed to load room types: ${roomTypesError.message}`] }
          }
        } else {
          roomTypeMap = new Map<string, string>()
          roomTypes?.forEach((rt) => {
            if (rt.pms_room_type_id) {
              roomTypeMap.set(String(rt.pms_room_type_id), rt.id)
            }
            if (rt.scidoo_room_type_id) {
              roomTypeMap.set(String(rt.scidoo_room_type_id), rt.id)
            }
            if (rt.code) {
              roomTypeMap.set(String(rt.code), rt.id)
            }
            // Match anche per nome camera (GSheets manda ROOM_TYPE_NAME)
            if (rt.name) {
              roomTypeMap.set(String(rt.name), rt.id)
            }
          })

          roomTypeCache = {
            data: roomTypeMap,
            timestamp: now,
            hotelId: hotelId,
          }

          console.log("[v0] Room types cache loaded:", roomTypeMap.size, "mappings")
          console.log(
            "[v0] PMS IDs mapped:",
            roomTypes?.filter((rt) => rt.pms_room_type_id).map((rt) => rt.pms_room_type_id),
          )
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const isRateLimitError =
          errorMessage.includes("Too Many R") ||
          errorMessage.includes("Unexpected token") ||
          errorMessage.includes("not valid JSON") ||
          errorMessage.includes("SyntaxError")

        if (isRateLimitError) {
          if (roomTypeCache && roomTypeCache.hotelId === hotelId) {
            console.log(
              "[v0] Rate limit detected (exception), using stale cached room types:",
              roomTypeCache.data.size,
              "types",
            )
            roomTypeMap = roomTypeCache.data
          } else {
            return { success: 0, errors: [`Database temporarily unavailable (rate limited), please try again`] }
          }
        } else {
          console.error("[v0] Exception loading room types:", err)
          return { success: 0, errors: [`Failed to load room types: ${errorMessage}`] }
        }
      }
    }

    const BATCH_SIZE = 100
    const totalBookings = bookings.length + startFromIndex

    for (let i = 0; i < bookings.length; i += BATCH_SIZE) {
      const batch = bookings.slice(i, i + BATCH_SIZE)
      const currentBatchNumber = Math.floor((i + startFromIndex) / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(totalBookings / BATCH_SIZE)

      for (const booking of batch) {
        try {
          const roomTypeCode = String(booking.room_type_code || "0")
          const roomTypeId = roomTypeMap.get(roomTypeCode)

          if (!roomTypeId) {
            console.warn(`[v0] Room type ${roomTypeCode} not found for booking ${booking.pms_booking_id}, skipping`)
            errors.push(`Booking ${booking.pms_booking_id}: Room type ${roomTypeCode} not found`)
            continue
          }

          const commissionAmount = booking.commission_rate
            ? booking.total_price * (booking.commission_rate / 100)
            : null

          // Safely convert a date string to a timestamptz ISO string (null-safe)
          const toTimestamp = (dateStr: string | null | undefined): string | null => {
            if (!dateStr) return null
            const clean = dateStr.split("T")[0].split(" ")[0]
            return `${clean}T00:00:00Z`
          }
          // Safely extract just the date portion YYYY-MM-DD (null-safe)
          const toDateOnly = (dateStr: string | null | undefined): string | null => {
            if (!dateStr) return null
            return dateStr.split("T")[0].split(" ")[0]
          }

          let retries = 3
          let lastError: any = null

          while (retries > 0) {
            try {
              const { error } = await supabase.from("bookings").upsert(
                {
                  hotel_id: hotelId,
                  room_type_id: roomTypeId,
                  pms_booking_id: booking.pms_booking_id,
                  pms_reservation_number: booking.pms_reservation_number || null,
                  booking_date: toDateOnly(booking.booking_date),
                  booking_datetime: toTimestamp(booking.booking_date),
                  check_in_date: toDateOnly(booking.check_in_date),
                  check_out_date: toDateOnly(booking.check_out_date),
                  is_cancelled: booking.is_cancelled,
                  cancellation_date: booking.cancellation_date ? toDateOnly(booking.cancellation_date) : null,
                  cancellation_datetime: booking.cancellation_date ? toTimestamp(booking.cancellation_date) : null,
                  cancellation_reason: booking.cancellation_reason || null,
                  guest_name: booking.guest_name,
                  guest_email: booking.guest_email || null,
                  guest_phone: booking.guest_phone || null,
                  guest_country: booking.guest_country || null,
                  number_of_rooms: booking.number_of_rooms,
                  number_of_nights: booking.number_of_nights,
                  number_of_guests: booking.number_of_guests,
                  price_per_night: booking.price_per_night,
                  total_price: booking.total_price,
                  channel: booking.channel,
                  is_direct: booking.is_direct,
                  commission_rate: booking.commission_rate || null,
                  commission_amount: commissionAmount,
                  source: "pms",
                  imported_at: new Date().toISOString(),
                },
                {
                  onConflict: "hotel_id,pms_booking_id",
                },
              )

              if (error) {
                lastError = error
                throw error
              }

              success++
              break
            } catch (err) {
              lastError = err
              retries--

              if (retries > 0) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)))
              }
            }
          }

          if (retries === 0 && lastError) {
            console.error(`[v0] Error importing booking ${booking.pms_booking_id} after retries:`, lastError)
            errors.push(`Booking ${booking.pms_booking_id}: ${lastError.message || lastError}`)
          }
        } catch (err) {
          console.error(`[v0] Exception importing booking ${booking.pms_booking_id}:`, err)
          errors.push(`Booking ${booking.pms_booking_id}: ${err}`)
        }
      }

      console.log(
        `[v0] Processed batch ${currentBatchNumber}/${totalBatches}: ${success + startFromIndex} imported so far`,
      )

      if (jobId) {
        const { SyncJobService } = await import("./sync-job-service")
        const checkpoint: SyncJobCheckpoint = {
          bookings_processed: i + batch.length + startFromIndex,
          last_batch: currentBatchNumber,
          last_processed_at: new Date().toISOString(),
          total_bookings: totalBookings,
        }
        await SyncJobService.updateCheckpoint(jobId, checkpoint)
      }

      if (i + BATCH_SIZE < bookings.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    console.log(`[v0] Bookings import summary: ${success} imported, ${errors.length} errors`)
    return { success, errors }
  }

  /**
   * Importa disponibilità giornaliere dal PMS
   */
  static async importAvailability(
    hotelId: string,
    availability: PMSAvailabilityImport[],
  ): Promise<{ success: number; errors: string[] }> {
    const supabase = await createServiceRoleClient()
    const errors: string[] = []
    let success = 0

    console.log("[v0] importAvailability - Using table: public.daily_availability")

    const { data: roomTypes, error: roomTypesError } = await supabase
      .from("room_types")
      .select("id, code, name, pms_room_type_id, scidoo_room_type_id")
      .eq("hotel_id", hotelId)

    if (roomTypesError) {
      return { success: 0, errors: [`Failed to load room types: ${roomTypesError.message}`] }
    }

    const roomTypeMap = new Map<string, string>()
    roomTypes?.forEach((rt) => {
      if (rt.pms_room_type_id) {
        roomTypeMap.set(String(rt.pms_room_type_id), rt.id)
      }
      if (rt.scidoo_room_type_id) {
        roomTypeMap.set(String(rt.scidoo_room_type_id), rt.id)
      }
      if (rt.code) {
        roomTypeMap.set(String(rt.code), rt.id)
      }
      if (rt.name) {
        roomTypeMap.set(String(rt.name), rt.id)
      }
    })

    console.log("[v0] importAvailability - Room type mappings loaded:", roomTypeMap.size)
    console.log("[v0] importAvailability - PMS IDs mapped:", Array.from(roomTypeMap.keys()))

    const BATCH_SIZE = 100
    const validRecords: any[] = []

    if (availability.length > 0) {
      console.log(
        "[v0] importAvailability - Sample incoming data:",
        availability.slice(0, 3).map((a) => ({
          room_type_code: a.room_type_code,
          date: a.date,
          rooms_available: a.rooms_available,
          total_rooms: a.total_rooms,
        })),
      )
    }

    for (const avail of availability) {
      const roomTypeId = roomTypeMap.get(String(avail.room_type_code))

      if (!roomTypeId) {
        continue
      }

      const roomsAvailable =
        avail.rooms_available !== undefined ? avail.rooms_available : avail.total_rooms - avail.rooms_out_of_service

      validRecords.push({
        hotel_id: hotelId,
        room_type_id: roomTypeId,
        date: avail.date,
        total_rooms: avail.total_rooms,
        rooms_out_of_service: avail.rooms_out_of_service,
        rooms_available: roomsAvailable,
        source: "pms",
        imported_at: new Date().toISOString(),
      })
    }

    console.log("[v0] importAvailability - Valid records to import:", validRecords.length)

    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batch = validRecords.slice(i, i + BATCH_SIZE)

      const { error } = await supabase.from("daily_availability").upsert(batch, {
        onConflict: "hotel_id,room_type_id,date",
      })

      if (error) {
        console.error("[v0] Batch insert error:", error)
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        success += batch.length
      }
    }

    console.log("[v0] importAvailability - Imported:", success, "Errors:", errors.length)
    return { success, errors }
  }

  /**
   * Ricalcola occupazione e revenue per un periodo
   */
  static async recalculateMetrics(
    hotelId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceRoleClient()

    try {
      const dates: string[] = []
      const start = new Date(startDate)
      const end = new Date(endDate)

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split("T")[0])
      }

      for (const date of dates) {
        await supabase.rpc("calculate_daily_occupancy", {
          p_hotel_id: hotelId,
          p_date: date,
        })

        await supabase.rpc("calculate_daily_revenue", {
          p_hotel_id: hotelId,
          p_date: date,
        })
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Importa storico completo (prenotazioni + disponibilità + calcolo KPI)
   */
  static async importHistoricalData(
    hotelId: string,
    bookings: PMSBookingImport[],
    availability: PMSAvailabilityImport[],
  ): Promise<{
    bookings: { success: number; errors: string[] }
    availability: { success: number; errors: string[] }
    metrics: { success: boolean; error?: string }
  }> {
    const bookingsResult = await this.importBookings(hotelId, bookings)
    const availabilityResult = await this.importAvailability(hotelId, availability)

    const allDates = [
      ...bookings.map((b) => b.check_in_date),
      ...bookings.map((b) => b.check_out_date),
      ...availability.map((a) => a.date),
    ].sort()

    const startDate = allDates[0]
    const endDate = allDates[allDates.length - 1]

    const metricsResult = await this.recalculateMetrics(hotelId, startDate, endDate)

    return {
      bookings: bookingsResult,
      availability: availabilityResult,
      metrics: metricsResult,
    }
  }
}
