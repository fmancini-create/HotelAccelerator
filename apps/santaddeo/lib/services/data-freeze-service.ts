/**
 * Data Freeze Service
 * Manages the freezing of data older than 30 days.
 *
 * NOTA 17/05/2026: ridotto allo scope effettivo. Le tabelle storiche di
 * cui questo servizio si occupa hanno effettivamente le colonne
 * `is_frozen`/`frozen_at` solo su `daily_production` e `daily_availability`.
 * `connectors.scidoo_raw_bookings` (storico raw) e `public.daily_occupancy`
 * sono state rimosse dal freeze perche':
 *  - Le colonne `is_frozen`/`frozen_at` non esistono su quei tavoli (in DB).
 *  - Le tabelle sono vuote (i bookings reali vivono in `public.bookings`,
 *    l'occupancy aggregata vive in `daily_production`).
 * Lasciare le UPDATE sopravvivere causava errori 42703 a ogni run del
 * cron `freeze-data` (vedi log triage 16/05).
 */

import { createServiceRoleClient } from "@/lib/supabase/server"

export class DataFreezeService {
  /**
   * Freeze all data older than 30 days.
   * This should be run daily via a cron job.
   */
  static async freezeOldData(): Promise<{
    success: boolean
    dailyProductionFrozen: number
    dailyAvailabilityFrozen: number
    error?: string
  }> {
    try {
      const supabase = await createServiceRoleClient()
      const freezeDate = new Date()
      freezeDate.setDate(freezeDate.getDate() - 30)
      const freezeDateStr = freezeDate.toISOString().split("T")[0]
      const nowIso = new Date().toISOString()

      console.log(`[DataFreezeService] Freezing data older than ${freezeDateStr}`)

      // Freeze daily_production
      const { data: dailyProductionData, error: dailyProductionError } = await supabase
        .from("daily_production")
        .update({ is_frozen: true, frozen_at: nowIso })
        .lt("date", freezeDateStr)
        .eq("is_frozen", false)
        .select("id")

      if (dailyProductionError) {
        console.error("[DataFreezeService] Error freezing daily_production:", dailyProductionError)
      }

      // Freeze daily_availability
      // NB: prima era `from("public.daily_availability")` -> Supabase
      // antepone `public.` di default, generando `public.public.daily_availability`
      // (404). Il prefix esplicito non serve.
      const { data: dailyAvailabilityData, error: dailyAvailabilityError } = await supabase
        .from("daily_availability")
        .update({ is_frozen: true, frozen_at: nowIso })
        .lt("date", freezeDateStr)
        .eq("is_frozen", false)
        .select("id")

      if (dailyAvailabilityError) {
        console.error("[DataFreezeService] Error freezing daily_availability:", dailyAvailabilityError)
      }

      const result = {
        success: !dailyProductionError && !dailyAvailabilityError,
        dailyProductionFrozen: dailyProductionData?.length || 0,
        dailyAvailabilityFrozen: dailyAvailabilityData?.length || 0,
      }

      console.log("[DataFreezeService] Freeze completed:", result)
      return result
    } catch (error) {
      console.error("[DataFreezeService] Error freezing data:", error)
      return {
        success: false,
        dailyProductionFrozen: 0,
        dailyAvailabilityFrozen: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Check if a specific date is frozen (older than 30 days)
   */
  static isDateFrozen(date: string | Date): boolean {
    const checkDate = typeof date === "string" ? new Date(date) : date
    const freezeDate = new Date()
    freezeDate.setDate(freezeDate.getDate() - 30)
    return checkDate < freezeDate
  }

  /**
   * Get freeze statistics for a hotel.
   * Esposta su daily_production (la tabella che effettivamente porta lo
   * stato `is_frozen`).
   */
  static async getFreezeStats(hotelId: string): Promise<{
    daily_production_frozen: number
    daily_production_total: number
  }> {
    const supabase = await createServiceRoleClient()

    const { data: dailyProduction } = await supabase
      .from("daily_production")
      .select("id, is_frozen", { count: "exact" })
      .eq("hotel_id", hotelId)

    return {
      daily_production_frozen: dailyProduction?.filter((d) => d.is_frozen).length || 0,
      daily_production_total: dailyProduction?.length || 0,
    }
  }
}
