import { createClient } from "@/lib/supabase/server"
import type { HotelDailySummary, PeriodComparison, Booking } from "@/lib/types/database"

/**
 * Service per calcolare KPI e metriche da dati granulari
 */

export class KPIService {
  /**
   * Ottiene il summary giornaliero aggregato per un hotel
   */
  static async getHotelDailySummary(hotelId: string, date: string): Promise<HotelDailySummary | null> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("hotel_daily_summary")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("date", date)
      .single()

    if (error || !data) return null

    return data as HotelDailySummary
  }

  /**
   * Ottiene prenotazioni delle ultime 24 ore
   */
  static async getLast24HoursBookings(hotelId: string): Promise<Booking[]> {
    const supabase = await createClient()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", false)
      .gte("created_at", yesterday.toISOString())
      .order("created_at", { ascending: false })

    return (data as Booking[]) || []
  }

  /**
   * Ottiene cancellazioni delle ultime 24 ore
   */
  static async getLast24HoursCancellations(hotelId: string): Promise<Booking[]> {
    const supabase = await createClient()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("is_cancelled", true)
      .gte("updated_at", yesterday.toISOString())
      .order("updated_at", { ascending: false })

    return (data as Booking[]) || []
  }

  /**
   * Calcola metriche da una lista di prenotazioni
   */
  static calculateBookingMetrics(bookings: Booking[]): {
    total_room_nights: number
    total_revenue: number
    avg_revpor: number
    avg_pickup_time: number
  } {
    if (bookings.length === 0) {
      return {
        total_room_nights: 0,
        total_revenue: 0,
        avg_revpor: 0,
        avg_pickup_time: 0,
      }
    }

    const totalRoomNights = bookings.reduce((sum, b) => sum + b.number_of_rooms * b.number_of_nights, 0)

    const totalRevenue = bookings.reduce((sum, b) => sum + b.total_price, 0)

    const avgRevpor = totalRoomNights > 0 ? totalRevenue / totalRoomNights : 0

    const pickupTimes = bookings
      .map((b) => (b.is_cancelled ? b.cancellation_pickup_days : b.booking_pickup_days))
      .filter((p): p is number => p !== null)

    const avgPickupTime = pickupTimes.length > 0 ? pickupTimes.reduce((sum, p) => sum + p, 0) / pickupTimes.length : 0

    return {
      total_room_nights: totalRoomNights,
      total_revenue: totalRevenue,
      avg_revpor: avgRevpor,
      avg_pickup_time: Math.round(avgPickupTime),
    }
  }

  /**
   * Confronta due periodi
   */
  static comparePeriods(current: HotelDailySummary, previous: HotelDailySummary): PeriodComparison {
    const revenueChange = current.total_revenue - previous.total_revenue
    const revenueChangePercent = previous.total_revenue > 0 ? (revenueChange / previous.total_revenue) * 100 : 0

    const roomNightsChange = current.total_rooms_occupied - previous.total_rooms_occupied
    const roomNightsChangePercent =
      previous.total_rooms_occupied > 0 ? (roomNightsChange / previous.total_rooms_occupied) * 100 : 0

    const revporChange = current.revpor - previous.revpor
    const revporChangePercent = previous.revpor > 0 ? (revporChange / previous.revpor) * 100 : 0

    const revparChange = current.revpar - previous.revpar
    const revparChangePercent = previous.revpar > 0 ? (revparChange / previous.revpar) * 100 : 0

    const occupancyChange = current.occupancy_rate - previous.occupancy_rate
    const occupancyChangePercent = previous.occupancy_rate > 0 ? (occupancyChange / previous.occupancy_rate) * 100 : 0

    return {
      current,
      previous,
      revenue_change: revenueChange,
      revenue_change_percent: revenueChangePercent,
      room_nights_change: roomNightsChange,
      room_nights_change_percent: roomNightsChangePercent,
      revpor_change: revporChange,
      revpor_change_percent: revporChangePercent,
      revpar_change: revparChange,
      revpar_change_percent: revparChangePercent,
      occupancy_change: occupancyChange,
      occupancy_change_percent: occupancyChangePercent,
    }
  }
}
