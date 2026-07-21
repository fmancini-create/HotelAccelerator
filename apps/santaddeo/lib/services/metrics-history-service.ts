import { createServiceRoleClient } from "@/lib/supabase/server"

export type MetricsEventType = "occupancy" | "production" | "pricing" | "booking" | "cancellation"
export type TriggerSource = "sync" | "manual" | "api" | "system"

interface OccupancyMetrics {
  totalRooms?: number
  roomsOccupied?: number
  roomsAvailable?: number
  occupancyRate?: number
}

interface ProductionMetrics {
  dailyProduction?: number
  roomNightsSold?: number
  adr?: number
  revpar?: number
}

interface BookingMetrics {
  bookingsCount?: number
  cancellationsCount?: number
  newBookingsRevenue?: number
  cancelledRevenue?: number
  avgBookingPickupDays?: number
  avgCancellationPickupDays?: number
  channelBreakdown?: Record<string, number>
}

interface MetricsHistoryEntry {
  hotelId: string
  eventType: MetricsEventType
  eventDate: string // YYYY-MM-DD format
  triggerSource: TriggerSource
  triggerDetails?: Record<string, unknown>
  roomTypeId?: string
  roomTypeCode?: string
  occupancy?: OccupancyMetrics
  production?: ProductionMetrics
  booking?: BookingMetrics
  previousValues?: Record<string, unknown>
  rawData?: Record<string, unknown>
}

export class MetricsHistoryService {
  /**
   * Record a metrics change event to the history table
   */
  static async recordEvent(entry: MetricsHistoryEntry): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await createServiceRoleClient()

      const { error } = await supabase.from("rms_metrics_history").insert({
        hotel_id: entry.hotelId,
        event_type: entry.eventType,
        event_date: entry.eventDate,
        trigger_source: entry.triggerSource,
        trigger_details: entry.triggerDetails || null,
        room_type_id: entry.roomTypeId || null,
        room_type_code: entry.roomTypeCode || null,
        // Occupancy metrics
        total_rooms: entry.occupancy?.totalRooms || null,
        rooms_occupied: entry.occupancy?.roomsOccupied || null,
        rooms_available: entry.occupancy?.roomsAvailable || null,
        occupancy_rate: entry.occupancy?.occupancyRate || null,
        // Production metrics
        daily_production: entry.production?.dailyProduction || null,
        room_nights_sold: entry.production?.roomNightsSold || null,
        adr: entry.production?.adr || null,
        revpar: entry.production?.revpar || null,
        // Booking metrics
        bookings_count: entry.booking?.bookingsCount || null,
        cancellations_count: entry.booking?.cancellationsCount || null,
        new_bookings_revenue: entry.booking?.newBookingsRevenue || null,
        cancelled_revenue: entry.booking?.cancelledRevenue || null,
        avg_booking_pickup_days: entry.booking?.avgBookingPickupDays || null,
        avg_cancellation_pickup_days: entry.booking?.avgCancellationPickupDays || null,
        channel_breakdown: entry.booking?.channelBreakdown || null,
        // Delta tracking
        previous_values: entry.previousValues || null,
        raw_data: entry.rawData || null,
      })

      if (error) {
        console.error("[MetricsHistory] Error recording event:", error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (err) {
      console.error("[MetricsHistory] Exception recording event:", err)
      return { success: false, error: String(err) }
    }
  }

  /**
   * Record occupancy change for a specific room type and date
   */
  static async recordOccupancyChange(
    hotelId: string,
    eventDate: string,
    triggerSource: TriggerSource,
    occupancy: OccupancyMetrics,
    roomTypeId?: string,
    roomTypeCode?: string,
    previousValues?: OccupancyMetrics
  ): Promise<{ success: boolean; error?: string }> {
    return this.recordEvent({
      hotelId,
      eventType: "occupancy",
      eventDate,
      triggerSource,
      roomTypeId,
      roomTypeCode,
      occupancy,
      previousValues: previousValues as Record<string, unknown>,
    })
  }

  /**
   * Record production change for a specific date
   */
  static async recordProductionChange(
    hotelId: string,
    eventDate: string,
    triggerSource: TriggerSource,
    production: ProductionMetrics,
    roomTypeId?: string,
    roomTypeCode?: string,
    previousValues?: ProductionMetrics
  ): Promise<{ success: boolean; error?: string }> {
    return this.recordEvent({
      hotelId,
      eventType: "production",
      eventDate,
      triggerSource,
      roomTypeId,
      roomTypeCode,
      production,
      previousValues: previousValues as Record<string, unknown>,
    })
  }

  /**
   * Record a new booking event
   */
  static async recordBookingEvent(
    hotelId: string,
    eventDate: string,
    triggerSource: TriggerSource,
    booking: BookingMetrics,
    triggerDetails?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    return this.recordEvent({
      hotelId,
      eventType: "booking",
      eventDate,
      triggerSource,
      triggerDetails,
      booking,
    })
  }

  /**
   * Record a cancellation event
   */
  static async recordCancellationEvent(
    hotelId: string,
    eventDate: string,
    triggerSource: TriggerSource,
    booking: BookingMetrics,
    triggerDetails?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    return this.recordEvent({
      hotelId,
      eventType: "cancellation",
      eventDate,
      triggerSource,
      triggerDetails,
      booking,
    })
  }

  /**
   * Record pricing change for a specific room type and date
   */
  static async recordPricingChange(
    hotelId: string,
    eventDate: string,
    triggerSource: TriggerSource,
    roomTypeId: string,
    roomTypeCode: string,
    newPrice: number,
    previousPrice?: number,
    rawData?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    return this.recordEvent({
      hotelId,
      eventType: "pricing",
      eventDate,
      triggerSource,
      roomTypeId,
      roomTypeCode,
      production: { adr: newPrice },
      previousValues: previousPrice ? { adr: previousPrice } : undefined,
      rawData,
    })
  }

  /**
   * Batch record multiple events (useful for sync operations)
   */
  static async recordBatch(entries: MetricsHistoryEntry[]): Promise<{ success: boolean; error?: string; count: number }> {
    if (entries.length === 0) {
      return { success: true, count: 0 }
    }

    try {
      const supabase = await createServiceRoleClient()

      const rows = entries.map((entry) => ({
        hotel_id: entry.hotelId,
        event_type: entry.eventType,
        event_date: entry.eventDate,
        trigger_source: entry.triggerSource,
        trigger_details: entry.triggerDetails || null,
        room_type_id: entry.roomTypeId || null,
        room_type_code: entry.roomTypeCode || null,
        total_rooms: entry.occupancy?.totalRooms || null,
        rooms_occupied: entry.occupancy?.roomsOccupied || null,
        rooms_available: entry.occupancy?.roomsAvailable || null,
        occupancy_rate: entry.occupancy?.occupancyRate || null,
        daily_production: entry.production?.dailyProduction || null,
        room_nights_sold: entry.production?.roomNightsSold || null,
        adr: entry.production?.adr || null,
        revpar: entry.production?.revpar || null,
        bookings_count: entry.booking?.bookingsCount || null,
        cancellations_count: entry.booking?.cancellationsCount || null,
        new_bookings_revenue: entry.booking?.newBookingsRevenue || null,
        cancelled_revenue: entry.booking?.cancelledRevenue || null,
        avg_booking_pickup_days: entry.booking?.avgBookingPickupDays || null,
        avg_cancellation_pickup_days: entry.booking?.avgCancellationPickupDays || null,
        channel_breakdown: entry.booking?.channelBreakdown || null,
        previous_values: entry.previousValues || null,
        raw_data: entry.rawData || null,
      }))

      const { error } = await supabase.from("rms_metrics_history").insert(rows)

      if (error) {
        console.error("[MetricsHistory] Error recording batch:", error)
        return { success: false, error: error.message, count: 0 }
      }

      return { success: true, count: entries.length }
    } catch (err) {
      console.error("[MetricsHistory] Exception recording batch:", err)
      return { success: false, error: String(err), count: 0 }
    }
  }

  /**
   * Get history for a specific date range
   */
  static async getHistory(
    hotelId: string,
    startDate: string,
    endDate: string,
    eventType?: MetricsEventType,
    roomTypeId?: string
  ): Promise<{ data: unknown[]; error?: string }> {
    try {
      const supabase = await createServiceRoleClient()

      let query = supabase
        .from("rms_metrics_history")
        .select("*")
        .eq("hotel_id", hotelId)
        .gte("event_date", startDate)
        .lte("event_date", endDate)
        .order("recorded_at", { ascending: false })

      if (eventType) {
        query = query.eq("event_type", eventType)
      }

      if (roomTypeId) {
        query = query.eq("room_type_id", roomTypeId)
      }

      const { data, error } = await query

      if (error) {
        return { data: [], error: error.message }
      }

      return { data: data || [] }
    } catch (err) {
      return { data: [], error: String(err) }
    }
  }
}
