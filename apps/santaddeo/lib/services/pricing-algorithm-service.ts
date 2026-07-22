import { createClient } from "@/lib/supabase/server"

/**
 * @deprecated DEPRECATED 12/05/2026 (Architettura Ufficiale Santaddeo).
 *
 * Service legacy degli algoritmi di pricing dinamico.
 *
 * ATTENZIONE: questo file NON e' parte del motore pricing ufficiale.
 * NON viene chiamato da:
 *   - lib/pricing/recalculate-queued-prices.ts (cron pricing principale)
 *   - lib/pricing/auto-trigger.ts (autopilot)
 *   - app/api/autopilot/push-*-/route.ts (push PMS, manual e range)
 *   - UI /accelerator/pricing
 *
 * Scrive in `pricing_recommendations`, una tabella separata da `pricing_grid`
 * (single source of truth ufficiale). Le sue raccomandazioni NON influenzano
 * i prezzi pushati al PMS.
 *
 * Possibili reliquati di chiamata: pagine admin legacy come
 * /superadmin/subscriptions (preview algoritmo) o componenti dashboard
 * accelerator (anteprima recommendation).
 *
 * MOTORE PRICING UFFICIALE: `lib/pricing/calculate-suggested-price.ts`.
 * Tutto deve passare da li' (UI, recalculate queue, autopilot, replay debugger, push PMS).
 *
 * Roadmap rimozione:
 *   1. Audit chiamanti (grep `PricingAlgorithmService`) - 12/05/2026 OK
 *   2. Marcare @deprecated - 12/05/2026 OK
 *   3. Sostituire chiamate residue con il motore ufficiale (PR separato)
 *   4. Rimuovere classe + tabella `pricing_recommendations` (PR separato)
 *
 * NON eliminare brutalmente senza completare step 3-4.
 */

export interface PricingFactors {
  occupancy_rate: number
  days_until_checkin: number
  day_of_week: number // 0-6 (0 = domenica)
  is_weekend: boolean
  season_factor: number // 0.8 - 1.2
  demand_factor: number // 0.8 - 1.5
  competition_factor?: number // 0.9 - 1.1
}

export interface PricingRecommendation {
  room_type_id: string
  date: string
  current_price: number
  recommended_price: number
  price_change: number
  price_change_percent: number
  confidence_score: number
  factors: PricingFactors
  algorithm_type: "basic" | "advanced"
}

/**
 * @deprecated Use `calculateSuggestedPrice` from `@/lib/pricing/calculate-suggested-price`.
 * Vedi JSDoc del file per dettagli sulla deprecazione.
 */
export class PricingAlgorithmService {
  /**
   * ALGORITMO BASE
   * Logica strettamente legata all'occupazione
   * Consigliato per strutture fino a 25-30 camere
   */
  static async calculateBasicPricing(
    hotelId: string,
    roomTypeId: string,
    date: string,
    basePrice: number,
  ): Promise<PricingRecommendation> {
    const supabase = await createClient()

    // Ottieni disponibilità e occupazione
    const { data: availability } = await supabase
      .from("daily_availability")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("date", date)
      .single()

    const { data: occupancy } = await supabase
      .from("daily_room_occupancy")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("date", date)
      .single()

    // Calcola fattori
    const occupancyRate = occupancy?.occupancy_rate || 0
    const dateObj = new Date(date)
    const dayOfWeek = dateObj.getDay()
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0
    const today = new Date()
    const daysUntilCheckin = Math.floor((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    // Fattore stagionale (semplificato - può essere personalizzato)
    const month = dateObj.getMonth()
    let seasonFactor = 1.0
    if (month >= 5 && month <= 8)
      seasonFactor = 1.2 // Estate
    else if (month === 11 || month === 0)
      seasonFactor = 1.1 // Natale/Capodanno
    else if (month === 1 || month === 2) seasonFactor = 0.9 // Inverno

    // LOGICA ALGORITMO BASE
    let priceMultiplier = 1.0

    // 1. Basato sull'occupazione attuale
    if (occupancyRate >= 90) {
      priceMultiplier = 1.3 // +30% se quasi pieno
    } else if (occupancyRate >= 80) {
      priceMultiplier = 1.2 // +20%
    } else if (occupancyRate >= 70) {
      priceMultiplier = 1.1 // +10%
    } else if (occupancyRate >= 60) {
      priceMultiplier = 1.0 // prezzo base
    } else if (occupancyRate >= 50) {
      priceMultiplier = 0.95 // -5%
    } else if (occupancyRate >= 40) {
      priceMultiplier = 0.9 // -10%
    } else if (occupancyRate >= 30) {
      priceMultiplier = 0.85 // -15%
    } else {
      priceMultiplier = 0.8 // -20% se molto vuoto
    }

    // 2. Aggiustamento per weekend
    if (isWeekend) {
      priceMultiplier *= 1.1
    }

    // 3. Aggiustamento per stagione
    priceMultiplier *= seasonFactor

    // 4. Aggiustamento per booking window
    if (daysUntilCheckin <= 3) {
      priceMultiplier *= 1.15 // Last minute premium
    } else if (daysUntilCheckin <= 7) {
      priceMultiplier *= 1.1
    } else if (daysUntilCheckin >= 90) {
      priceMultiplier *= 0.95 // Early bird discount
    }

    const recommendedPrice = Math.round(basePrice * priceMultiplier)
    const priceChange = recommendedPrice - basePrice
    const priceChangePercent = (priceChange / basePrice) * 100

    // Confidence score basato sulla quantità di dati disponibili
    const confidenceScore = occupancy ? 0.85 : 0.6

    return {
      room_type_id: roomTypeId,
      date,
      current_price: basePrice,
      recommended_price: recommendedPrice,
      price_change: priceChange,
      price_change_percent: priceChangePercent,
      confidence_score: confidenceScore,
      factors: {
        occupancy_rate: occupancyRate,
        days_until_checkin: daysUntilCheckin,
        day_of_week: dayOfWeek,
        is_weekend: isWeekend,
        season_factor: seasonFactor,
        demand_factor: priceMultiplier,
      },
      algorithm_type: "basic",
    }
  }

  /**
   * ALGORITMO AVANZATO
   * Modello matematico complesso con variabili personalizzabili
   * Consigliato per grandi strutture
   */
  static async calculateAdvancedPricing(
    hotelId: string,
    roomTypeId: string,
    date: string,
    basePrice: number,
    customWeights?: {
      occupancy_weight?: number
      demand_weight?: number
      competition_weight?: number
      seasonality_weight?: number
      booking_window_weight?: number
    },
  ): Promise<PricingRecommendation> {
    const supabase = await createClient()

    // Pesi default (personalizzabili)
    const weights = {
      occupancy_weight: customWeights?.occupancy_weight || 0.35,
      demand_weight: customWeights?.demand_weight || 0.25,
      competition_weight: customWeights?.competition_weight || 0.15,
      seasonality_weight: customWeights?.seasonality_weight || 0.15,
      booking_window_weight: customWeights?.booking_window_weight || 0.1,
    }

    // Ottieni dati storici per analisi predittiva
    const dateObj = new Date(date)
    const lastYear = new Date(dateObj)
    lastYear.setFullYear(lastYear.getFullYear() - 1)

    const { data: historicalOccupancy } = await supabase
      .from("daily_room_occupancy")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .gte("date", lastYear.toISOString().split("T")[0])
      .lte("date", date)
      .order("date", { ascending: false })
      .limit(30)

    const { data: currentOccupancy } = await supabase
      .from("daily_room_occupancy")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("room_type_id", roomTypeId)
      .eq("date", date)
      .single()

    // Calcola fattori base
    const occupancyRate = currentOccupancy?.occupancy_rate || 0
    const dayOfWeek = dateObj.getDay()
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0
    const today = new Date()
    const daysUntilCheckin = Math.floor((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    // 1. OCCUPANCY FACTOR (0.7 - 1.4)
    let occupancyFactor = 1.0
    if (occupancyRate >= 95) occupancyFactor = 1.4
    else if (occupancyRate >= 90) occupancyFactor = 1.35
    else if (occupancyRate >= 85) occupancyFactor = 1.3
    else if (occupancyRate >= 80) occupancyFactor = 1.25
    else if (occupancyRate >= 75) occupancyFactor = 1.2
    else if (occupancyRate >= 70) occupancyFactor = 1.15
    else if (occupancyRate >= 65) occupancyFactor = 1.1
    else if (occupancyRate >= 60) occupancyFactor = 1.05
    else if (occupancyRate >= 50) occupancyFactor = 1.0
    else if (occupancyRate >= 40) occupancyFactor = 0.95
    else if (occupancyRate >= 30) occupancyFactor = 0.9
    else if (occupancyRate >= 20) occupancyFactor = 0.85
    else if (occupancyRate >= 10) occupancyFactor = 0.8
    else occupancyFactor = 0.7

    // 2. DEMAND FACTOR (basato su trend storico)
    let demandFactor = 1.0
    if (historicalOccupancy && historicalOccupancy.length > 0) {
      const avgHistoricalOccupancy =
        historicalOccupancy.reduce((sum, o) => sum + (o.occupancy_rate || 0), 0) / historicalOccupancy.length

      if (occupancyRate > avgHistoricalOccupancy + 15) demandFactor = 1.3
      else if (occupancyRate > avgHistoricalOccupancy + 10) demandFactor = 1.2
      else if (occupancyRate > avgHistoricalOccupancy + 5) demandFactor = 1.1
      else if (occupancyRate < avgHistoricalOccupancy - 15) demandFactor = 0.85
      else if (occupancyRate < avgHistoricalOccupancy - 10) demandFactor = 0.9
      else if (occupancyRate < avgHistoricalOccupancy - 5) demandFactor = 0.95
    }

    // 3. COMPETITION FACTOR (placeholder - può essere integrato con dati esterni)
    const competitionFactor = 1.0

    // 4. SEASONALITY FACTOR
    const month = dateObj.getMonth()
    let seasonalityFactor = 1.0
    if (month >= 5 && month <= 8)
      seasonalityFactor = 1.25 // Estate
    else if (month === 11 || month === 0)
      seasonalityFactor = 1.15 // Natale/Capodanno
    else if (month === 3 || month === 4 || month === 9 || month === 10)
      seasonalityFactor = 1.1 // Primavera/Autunno
    else seasonalityFactor = 0.9 // Inverno

    // Weekend boost
    if (isWeekend) seasonalityFactor *= 1.15

    // 5. BOOKING WINDOW FACTOR
    let bookingWindowFactor = 1.0
    if (daysUntilCheckin <= 1)
      bookingWindowFactor = 1.25 // Same day
    else if (daysUntilCheckin <= 3)
      bookingWindowFactor = 1.2 // Last minute
    else if (daysUntilCheckin <= 7) bookingWindowFactor = 1.15
    else if (daysUntilCheckin <= 14) bookingWindowFactor = 1.1
    else if (daysUntilCheckin <= 30) bookingWindowFactor = 1.05
    else if (daysUntilCheckin <= 60) bookingWindowFactor = 1.0
    else if (daysUntilCheckin <= 90) bookingWindowFactor = 0.98
    else bookingWindowFactor = 0.95 // Early bird

    // CALCOLO COEFFICIENTE K (crescita tariffa)
    const K =
      occupancyFactor * weights.occupancy_weight +
      demandFactor * weights.demand_weight +
      competitionFactor * weights.competition_weight +
      seasonalityFactor * weights.seasonality_weight +
      bookingWindowFactor * weights.booking_window_weight

    // Normalizza K per evitare variazioni troppo estreme
    const normalizedK = Math.max(0.7, Math.min(1.5, K))

    const recommendedPrice = Math.round(basePrice * normalizedK)
    const priceChange = recommendedPrice - basePrice
    const priceChangePercent = (priceChange / basePrice) * 100

    // Confidence score più alto per algoritmo avanzato
    const confidenceScore = historicalOccupancy && historicalOccupancy.length > 10 ? 0.95 : 0.8

    return {
      room_type_id: roomTypeId,
      date,
      current_price: basePrice,
      recommended_price: recommendedPrice,
      price_change: priceChange,
      price_change_percent: priceChangePercent,
      confidence_score: confidenceScore,
      factors: {
        occupancy_rate: occupancyRate,
        days_until_checkin: daysUntilCheckin,
        day_of_week: dayOfWeek,
        is_weekend: isWeekend,
        season_factor: seasonalityFactor,
        demand_factor: demandFactor,
        competition_factor: competitionFactor,
      },
      algorithm_type: "advanced",
    }
  }

  /**
   * Genera raccomandazioni per un periodo
   */
  static async generateRecommendations(
    hotelId: string,
    startDate: string,
    endDate: string,
    algorithmType: "basic" | "advanced" = "basic",
  ): Promise<PricingRecommendation[]> {
    const supabase = await createClient()

    // Ottieni tutte le tipologie di camera
    const { data: roomTypes } = await supabase.from("room_types").select("*").eq("hotel_id", hotelId).eq("is_active", true)

    if (!roomTypes || roomTypes.length === 0) return []

    const recommendations: PricingRecommendation[] = []

    // Genera array di date
    const dates: string[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split("T")[0])
    }

    // Per ogni tipologia e data, calcola raccomandazione
    for (const roomType of roomTypes) {
      const basePrice = roomType.base_price || 100

      for (const date of dates) {
        const recommendation =
          algorithmType === "advanced"
            ? await this.calculateAdvancedPricing(hotelId, roomType.id, date, basePrice)
            : await this.calculateBasicPricing(hotelId, roomType.id, date, basePrice)

        recommendations.push(recommendation)
      }
    }

    return recommendations
  }

  /**
   * Salva raccomandazioni nel database
   */
  static async saveRecommendations(hotelId: string, recommendations: PricingRecommendation[]): Promise<void> {
    const supabase = await createClient()

    const records = recommendations.map((rec) => ({
      hotel_id: hotelId,
      room_type_id: rec.room_type_id,
      date: rec.date,
      recommended_price: rec.recommended_price,
      current_price: rec.current_price,
      algorithm_type: rec.algorithm_type,
      confidence_score: rec.confidence_score,
      factors: rec.factors,
      applied: false,
    }))

    await supabase.from("pricing_recommendations").upsert(records, {
      onConflict: "hotel_id,room_type_id,date",
    })
  }
}
