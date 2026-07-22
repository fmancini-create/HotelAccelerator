/**
 * K Variables Calculation Service
 * 
 * Calculates the raw values (0-10) for each K variable based on:
 * - Automatic calculations from existing data
 * - External API data (weather)
 * - Manual inputs (events)
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { computePaceRatioForNight } from "@/lib/pace/compute"

// Variable value ranges and normalization
interface KVariableConfig {
  key: string
  calculate: (params: CalculationParams) => Promise<number>
  requiresExternalData: boolean
  isAutomatic: boolean
}

interface CalculationParams {
  hotelId: string
  date: string
  roomTypeId?: string
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>
}

/**
 * Calculate k_occupancy_rate (0-10)
 * 0 = 0% occupancy, 10 = 100% occupancy
 */
async function calculateOccupancyRate(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params

  // FIX 13/05/2026: la colonna in daily_availability si chiama `rooms_available`,
  // non `available_rooms`. Prima il query falliva silenziosamente e ritornava
  // sempre 5 (default neutro). Verificato via information_schema.
  const { data: availability } = await supabase
    .from("daily_availability")
    .select("rooms_available, total_rooms")
    .eq("hotel_id", hotelId)
    .eq("date", date)

  if (!availability || availability.length === 0) {
    return 5 // Default to middle value if no data
  }

  const totalRooms = availability.reduce((sum, a) => sum + (a.total_rooms || 0), 0)
  const availableRooms = availability.reduce((sum, a) => sum + (a.rooms_available || 0), 0)

  if (totalRooms === 0) return 5

  const bookedRooms = totalRooms - availableRooms
  const occupancyRate = bookedRooms / totalRooms

  // Convert to 0-10 scale
  return Math.round(Math.max(0, Math.min(1, occupancyRate)) * 10)
}

/**
 * Calculate k_lead_time (0-10)
 * 0 = same day (last minute), 10 = 60+ days in advance
 */
async function calculateLeadTime(params: CalculationParams): Promise<number> {
  const { date } = params
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(date)
  targetDate.setHours(0, 0, 0, 0)
  
  const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays <= 0) return 0      // Same day or past
  if (diffDays <= 1) return 1      // Tomorrow
  if (diffDays <= 3) return 2      // 2-3 days
  if (diffDays <= 7) return 3      // 1 week
  if (diffDays <= 14) return 4     // 2 weeks
  if (diffDays <= 21) return 5     // 3 weeks
  if (diffDays <= 30) return 6     // 1 month
  if (diffDays <= 45) return 7     // 1.5 months
  if (diffDays <= 60) return 8     // 2 months
  if (diffDays <= 90) return 9     // 3 months
  return 10                         // 3+ months
}

/**
 * Calculate k_day_of_week (0-10)
 * Misura quanto "vale" una notte per giorno della settimana, basandosi sulle
 * NOTTI EFFETTIVAMENTE OCCUPATE (non sui check-in count).
 *
 * FIX 13/05/2026: la versione precedente contava i check-in per DOW. Era un
 * proxy fuorviante: un check-in il venerdi' tipicamente porta 2 notti
 * (ven+sab), mentre uno il sabato spesso ne porta 1 (sab) o 2 (sab+dom).
 * Risultato: il venerdi' contava come "top day" anche se il sabato e' il
 * giorno con piu' notti occupate e RevPAR piu' alto (es. Villa I Barronci
 * ha 942 check-in il ven vs 935 il sab, ma 1600 notti ven vs 1747 notti sab
 * e revenue 357k vs 426k). Adesso espandiamo ogni booking in notti occupate
 * e contiamo quelle.
 */
async function calculateDayOfWeek(params: CalculationParams): Promise<number> {
  const { date, hotelId, supabase } = params

  const targetDate = new Date(date)
  const dayOfWeek = targetDate.getDay() // 0=Sunday, 6=Saturday

  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  const { data: historicalData } = await supabase
    .from("bookings")
    .select("check_in_date, check_out_date")
    .eq("hotel_id", hotelId)
    .gte("check_in_date", yearAgo)
    .eq("is_cancelled", false)

  if (historicalData && historicalData.length > 50) {
    // Espandi ogni booking in notti occupate e conta per DOW.
    const nightsByDow = [0, 0, 0, 0, 0, 0, 0]
    for (const r of historicalData) {
      if (!r.check_out_date) continue
      const ci = new Date(r.check_in_date)
      const co = new Date(r.check_out_date)
      // Limite di sicurezza: max 60 notti per booking per evitare loop
      // se ci sono dati sporchi nel PMS.
      let guard = 0
      const d = new Date(ci.getTime())
      while (d < co && guard < 60) {
        nightsByDow[d.getDay()]++
        d.setUTCDate(d.getUTCDate() + 1)
        guard++
      }
    }
    const maxNights = Math.max(...nightsByDow)
    if (maxNights > 0) {
      return Math.round((nightsByDow[dayOfWeek] / maxNights) * 10)
    }
  }

  // Default pattern: weekends higher
  const defaultPatterns: Record<number, number> = {
    0: 7,  // Sunday
    1: 4,  // Monday
    2: 4,  // Tuesday
    3: 5,  // Wednesday
    4: 6,  // Thursday
    5: 8,  // Friday
    6: 9,  // Saturday
  }

  return defaultPatterns[dayOfWeek] ?? 5
}

/**
 * Calculate k_booking_pace (0-10)
 * Compares current bookings vs same period last year
 * 0 = way behind, 5 = on pace, 10 = way ahead
 */
function paceRatioToScore(paceRatio: number): number {
  if (paceRatio <= 0.5) return 2 // Way behind
  if (paceRatio <= 0.7) return 3 // Behind
  if (paceRatio <= 0.9) return 4 // Slightly behind
  if (paceRatio <= 1.1) return 5 // On pace
  if (paceRatio <= 1.3) return 6 // Slightly ahead
  if (paceRatio <= 1.5) return 7 // Ahead
  if (paceRatio <= 2.0) return 8 // Way ahead
  return 10 // Much higher demand
}

async function calculateBookingPace(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params
  
  const targetDate = new Date(date)
  const today = new Date()
  const daysUntilDate = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysUntilDate < 0) return 5 // Past date

  // ENHANCEMENT (Booking Pace addon): usa il pace basato sulle CAMERE on-the-books
  // (stesso lead time anno scorso) invece del semplice conteggio righe. E' piu'
  // fedele alla domanda reale (1 prenotazione puo' valere 1 o 10 camere). Se non
  // c'e' storico sufficiente, si ricade sulla logica row-count storica sotto.
  try {
    const todayStr = today.toISOString().split("T")[0]
    const pace = await computePaceRatioForNight(supabase, {
      hotelId,
      stayDate: date,
      today: todayStr,
    })
    if (pace) return paceRatioToScore(pace.ratio)
  } catch (err) {
    console.log("[v0] booking_pace: fallback row-count (pace ratio non disponibile):", (err as Error)?.message)
  }

  // FIX 13/05/2026: tabella canonica `bookings`, colonna `check_in_date`,
  // flag `is_cancelled=false`. Per il lead-time cutoff sull'anno scorso
  // usiamo `booking_date` (data in cui il guest ha prenotato) invece di
  // `created_at` (che e' la data di import nel DB e quindi non riflette
  // il vero lead time storico).
  const { data: currentBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("check_in_date", date)
    .eq("is_cancelled", false)

  // Get bookings for same date last year at same lead time
  const lastYearDate = new Date(targetDate)
  lastYearDate.setFullYear(lastYearDate.getFullYear() - 1)
  const lastYearDateStr = lastYearDate.toISOString().split("T")[0]

  const lastYearCutoff = new Date(lastYearDate)
  lastYearCutoff.setDate(lastYearCutoff.getDate() - daysUntilDate)
  const lastYearCutoffStr = lastYearCutoff.toISOString().split("T")[0]

  const { data: lastYearBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("check_in_date", lastYearDateStr)
    .lte("booking_date", lastYearCutoffStr)
    .eq("is_cancelled", false)
  
  const currentCount = currentBookings?.length ?? 0
  const lastYearCount = lastYearBookings?.length ?? 0
  
  if (lastYearCount === 0) {
    // No historical data, use absolute scale
    if (currentCount === 0) return 5
    if (currentCount <= 2) return 6
    if (currentCount <= 5) return 7
    return 8
  }
  
  // Compare pace (fallback row-count)
  return paceRatioToScore(currentCount / lastYearCount)
}

/**
 * Calculate k_seasonality (0-10)
 * Based on historical occupancy patterns for this time of year
 */
async function calculateSeasonality(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params
  
  const targetDate = new Date(date)
  const month = targetDate.getMonth() + 1
  const dayOfMonth = targetDate.getDate()
  
  // Get historical occupancy for similar dates (same month, +/- 7 days)
  const startDay = Math.max(1, dayOfMonth - 7)
  const endDay = Math.min(28, dayOfMonth + 7)
  
  // FIX 13/05/2026: stessa colonna corretta usata in calculateOccupancyRate
  // (`rooms_available` invece di `available_rooms`).
  const { data: historicalOcc } = await supabase
    .from("daily_availability")
    .select("date, rooms_available, total_rooms")
    .eq("hotel_id", hotelId)
    .gte("date", `${targetDate.getFullYear() - 1}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`)
    .lte("date", `${targetDate.getFullYear() - 1}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`)

  if (historicalOcc && historicalOcc.length > 0) {
    const totalRooms = historicalOcc.reduce((sum, a) => sum + (a.total_rooms || 0), 0)
    const availableRooms = historicalOcc.reduce((sum, a) => sum + (a.rooms_available || 0), 0)

    if (totalRooms > 0) {
      const historicalOccRate = (totalRooms - availableRooms) / totalRooms
      return Math.round(Math.max(0, Math.min(1, historicalOccRate)) * 10)
    }
  }
  
  // Default seasonality by month (Italy/Mediterranean pattern)
  const monthPatterns: Record<number, number> = {
    1: 3,   // January - low
    2: 4,   // February
    3: 5,   // March
    4: 7,   // April - Easter
    5: 7,   // May
    6: 8,   // June
    7: 9,   // July - high
    8: 10,  // August - peak
    9: 7,   // September
    10: 5,  // October
    11: 4,  // November
    12: 6,  // December - holidays
  }
  
  return monthPatterns[month] ?? 5
}

/**
 * Calculate k_cancellation_rate (0-10)
 * Higher cancellation rate = lower confidence = lower K
 * 0 = very high cancellation rate (bad), 10 = very low (good)
 */
async function calculateCancellationRate(params: CalculationParams): Promise<number> {
  const { hotelId, supabase } = params
  
  // Get cancellation rate for last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  // FIX 13/05/2026: tabella canonica `bookings`, flag boolean `is_cancelled`.
  // La vecchia query su `reservations` (tabella inesistente) crashava e il catch
  // esterno tornava sempre 5.
  const { data: allReservations } = await supabase
    .from("bookings")
    .select("is_cancelled")
    .eq("hotel_id", hotelId)
    .gte("created_at", thirtyDaysAgo.toISOString())

  if (!allReservations || allReservations.length < 10) {
    return 5 // Not enough data
  }

  const cancelledCount = allReservations.filter(r => r.is_cancelled === true).length
  const cancellationRate = cancelledCount / allReservations.length
  
  // Invert: high cancellation = low K value
  if (cancellationRate >= 0.5) return 1   // 50%+ cancellation
  if (cancellationRate >= 0.4) return 2
  if (cancellationRate >= 0.3) return 3
  if (cancellationRate >= 0.25) return 4
  if (cancellationRate >= 0.2) return 5
  if (cancellationRate >= 0.15) return 6
  if (cancellationRate >= 0.1) return 7
  if (cancellationRate >= 0.05) return 8
  return 9                                 // < 5% cancellation
}

/**
 * Reputation score 0..10 driven by OTA reviews.
 *
 * Reads the precomputed score from `reputation_scores_v`, which encapsulates:
 *   - weighted avg rating over the last 180 days (90-day decay)
 *   - trend bonus/malus: avg(30d) vs avg(60-90d) (+/- 1.5)
 *   - volume penalty when fewer than 10 reviews in 180 days
 *
 * The view returns NULL when there are no recent reviews, in which case we
 * fall back to 5 (neutral), same pattern used by other variables.
 */
async function calculateReputationScore(params: CalculationParams): Promise<number> {
  const { hotelId, supabase } = params

  const { data, error } = await supabase
    .from("reputation_scores_v")
    .select("score")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (error || !data || data.score == null) {
    return 5
  }

  const numeric = Number(data.score)
  if (!Number.isFinite(numeric)) return 5
  return Math.max(0, Math.min(10, Number(numeric.toFixed(2))))
}

/**
 * Calculate k_holiday_national (0-10) — festivita' nazionali italiane.
 *
 * 13/05/2026: aggiunta perche' la variabile era nel registry ma senza
 * calcolatore -> il motore la vedeva fissa a default_weight.
 *
 * Logica:
 *  - giorno e' festivo nazionale o domenica di Pasqua -> 10 (massima pressione)
 *  - giorno adiacente a un festivo (prima/dopo) -> 8 (effetto ponte)
 *  - altrimenti -> 5 (neutro)
 *
 * Festivita' italiane considerate: Capodanno, Epifania, Pasqua + Pasquetta,
 * 25 aprile, 1 maggio, 2 giugno, Ferragosto, 1 novembre, 8 dicembre,
 * Natale, Santo Stefano.
 */
function isItalianHolidayKey(monthDay: string, easterKey: string, easterMondayKey: string): boolean {
  const fixed = new Set([
    "01-01", // Capodanno
    "01-06", // Epifania
    "04-25", // Liberazione
    "05-01", // Festa del Lavoro
    "06-02", // Festa della Repubblica
    "08-15", // Ferragosto
    "11-01", // Tutti i Santi
    "12-08", // Immacolata
    "12-25", // Natale
    "12-26", // Santo Stefano
  ])
  if (fixed.has(monthDay)) return true
  if (monthDay === easterKey) return true
  if (monthDay === easterMondayKey) return true
  return false
}

/**
 * Calcolo della data di Pasqua per un anno gregoriano (algoritmo di Gauss).
 * Restituisce { month, day }.
 */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function ymd(year: number, month: number, day: number): string {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

async function calculateHolidayNational(params: CalculationParams): Promise<number> {
  const { date } = params
  const target = new Date(date)
  const year = target.getFullYear()

  // Calcolo Pasqua + Pasquetta per l'anno corrente
  const easter = easterSunday(year)
  const easterDate = new Date(year, easter.month - 1, easter.day)
  const easterMonday = new Date(easterDate)
  easterMonday.setDate(easterMonday.getDate() + 1)

  const easterKey = ymd(year, easter.month, easter.day)
  const easterMondayKey = ymd(year, easterMonday.getMonth() + 1, easterMonday.getDate())

  const targetKey = ymd(year, target.getMonth() + 1, target.getDate())

  if (isItalianHolidayKey(targetKey, easterKey, easterMondayKey)) return 10

  // Controlla giorno prima e dopo (effetto ponte)
  const prev = new Date(target)
  prev.setDate(prev.getDate() - 1)
  const next = new Date(target)
  next.setDate(next.getDate() + 1)
  const prevKey = ymd(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())
  const nextKey = ymd(next.getFullYear(), next.getMonth() + 1, next.getDate())

  // Per "adjacent" considera che la festa potrebbe essere anche su un anno
  // diverso (gen 1 dopo dic 31). easter rimane comunque dell'anno target.
  if (
    isItalianHolidayKey(prevKey, easterKey, easterMondayKey) ||
    isItalianHolidayKey(nextKey, easterKey, easterMondayKey)
  ) {
    return 8
  }

  return 5
}

/**
 * Calculate k_last_minute (0-10) — pressione last-minute sulla data target.
 *
 * 13/05/2026: aggiunta. Concettualmente complementare al lead time, ma con
 * focus su quanto e' "calda" la finestra last-minute per quella data.
 *
 *  <=1 giorno  -> 10 (massima pressione)
 *  2-3 giorni  -> 9
 *  4-7 giorni  -> 7
 *  8-14 giorni -> 5
 *  15-30       -> 3
 *  >30         -> 1
 *
 * Non dipende da DB - sintetico, deterministico, sempre disponibile.
 */
async function calculateLastMinute(params: CalculationParams): Promise<number> {
  const { date } = params
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  const days = Math.floor((target.getTime() - today.getTime()) / 86400000)

  if (days < 0) return 5 // passato: neutro
  if (days <= 1) return 10
  if (days <= 3) return 9
  if (days <= 7) return 7
  if (days <= 14) return 5
  if (days <= 30) return 3
  return 1
}

/**
 * Calculate k_pickup_trend (0-10) — velocita' di acquisizione prenotazioni.
 *
 * 13/05/2026: aggiunta. Confronta i bookings creati negli ultimi 7 giorni
 * (basato su `booking_date`, NON `created_at` che e' la data di import ETL)
 * con quelli creati nei 7 giorni precedenti, per la stessa data di check-in.
 *
 *  rapporto >= 2.0  -> 10 (forte accelerazione)
 *  1.5 - 2.0        -> 8
 *  1.2 - 1.5        -> 7
 *  0.8 - 1.2        -> 5 (stabile / neutro)
 *  0.5 - 0.8        -> 3 (decelerazione)
 *  < 0.5            -> 1
 *
 * Se non ci sono dati o < 3 prenotazioni totali nelle ultime 2 settimane:
 * fallback a 5 (neutro). Per date passate: neutro.
 */
async function calculatePickupTrend(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  if (target.getTime() < today.getTime()) return 5 // passato

  // Finestre di confronto basate su booking_date
  const last7Start = new Date(today)
  last7Start.setDate(last7Start.getDate() - 7)
  const last14Start = new Date(today)
  last14Start.setDate(last14Start.getDate() - 14)

  const last7StartStr = last7Start.toISOString().split("T")[0]
  const last14StartStr = last14Start.toISOString().split("T")[0]
  const todayStr = today.toISOString().split("T")[0]

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("booking_date")
    .eq("hotel_id", hotelId)
    .eq("check_in_date", date)
    .eq("is_cancelled", false)
    .gte("booking_date", last14StartStr)
    .lte("booking_date", todayStr)

  if (error || !bookings) return 5

  let recent = 0
  let prior = 0
  for (const b of bookings) {
    if (!b.booking_date) continue
    if (b.booking_date >= last7StartStr) recent++
    else prior++
  }

  // Dati insufficienti -> neutro
  if (recent + prior < 3) return 5

  // Evita divisione per zero: se prior=0 ma recent>0 -> trend molto positivo
  if (prior === 0) return recent >= 3 ? 10 : 8

  const ratio = recent / prior
  if (ratio >= 2.0) return 10
  if (ratio >= 1.5) return 8
  if (ratio >= 1.2) return 7
  if (ratio >= 0.8) return 5
  if (ratio >= 0.5) return 3
  return 1
}

/**
 * Get weather forecast value (0-10)
 * Requires weather data to be fetched separately
 */
async function calculateWeather(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params
  
  // Check if we have weather data stored
  const { data: weatherData } = await supabase
    .from("weather_forecasts")
    .select("weather_score")
    .eq("hotel_id", hotelId)
    .eq("date", date)
    .single()
  
  if (weatherData?.weather_score !== undefined) {
    return weatherData.weather_score
  }
  
  return 5 // Default if no weather data
}

/**
 * Calculate k_length_of_stay (1-10)
 * Misura quanto e' "lungo" il soggiorno tipico per le notti di un certo giorno
 * della settimana, basandosi sullo storico ultimi 365gg per lo stesso hotel.
 *
 * Logica: per ogni booking che include una notte con lo stesso DOW della
 * `date` target, prendiamo `number_of_nights`. Il LOS medio (media delle
 * notti dei booking che insistono su quel DOW) viene mappato a una scala 1-10
 * con soglie pensate per il pattern italiano (LOS medio nazionale ~1.8 notti).
 *
 * 13/05/2026: prima di oggi non esisteva un calcolatore per questa variabile.
 * Risultato: pricing_algo_params.var_k_length_of_stay non veniva mai scritto
 * -> engine cadeva su default_weight=5 per OGNI data -> in UI riga sempre 5.
 */
async function calculateLengthOfStay(params: CalculationParams): Promise<number> {
  const { date, hotelId, supabase } = params

  const targetDate = new Date(date)
  const targetDow = targetDate.getDay()
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  const { data } = await supabase
    .from("bookings")
    .select("check_in_date, check_out_date, number_of_nights")
    .eq("hotel_id", hotelId)
    .eq("is_cancelled", false)
    .gte("check_in_date", yearAgo)

  if (!data || data.length < 30) return 5

  // Raccogli i LOS dei booking che coprono almeno una notte con DOW = targetDow.
  const losSamples: number[] = []
  for (const r of data) {
    if (!r.check_out_date || !r.number_of_nights) continue
    const ci = new Date(r.check_in_date)
    const co = new Date(r.check_out_date)
    // Controlla se il booking copre una notte con il targetDow
    let guard = 0
    const d = new Date(ci.getTime())
    let matches = false
    while (d < co && guard < 60) {
      if (d.getDay() === targetDow) {
        matches = true
        break
      }
      d.setUTCDate(d.getUTCDate() + 1)
      guard++
    }
    if (matches) losSamples.push(Number(r.number_of_nights))
  }

  if (losSamples.length < 10) return 5

  const avgLos = losSamples.reduce((s, n) => s + n, 0) / losSamples.length

  // Soglie LOS -> K (calibrate sul mercato hotel/agriturismo italiano)
  if (avgLos < 1.3) return 2   // mordi-e-fuggi (1 notte tipica)
  if (avgLos < 1.8) return 4   // weekend short break
  if (avgLos < 2.5) return 6   // soggiorni di 2-3 notti
  if (avgLos < 4)   return 8   // long weekend / mini-vacanza
  return 10                    // settimana piena, prezzo solido
}

/**
 * Calculate k_direct_demand (0-10) — PER-DATA dal 27/06/2026.
 *
 * Segnale di DOMANDA DIRETTA per la SPECIFICA data di soggiorno, dalle ricerche
 * reali catturate dallo script widget in `site_search_daily` (una riga per notte
 * cercata, con `searches` e `last_searched_at`). Risolve il limite precedente:
 * prima il trend delle visite "di oggi" veniva spalmato identico su tutte le
 * date; ora ogni notte riceve un K legato a QUANDO e QUANTO e' stata cercata.
 *
 * Modello (asse principale = RECENCY della ricerca per quella data):
 *   - cercata di recente  -> domanda calda  -> K alto (>5)
 *   - cercata tempo fa    -> domanda che si raffredda -> K che PEGGIORA col tempo
 *   - mai cercata (riga assente, ma hotel con dati) -> data fredda -> K basso
 *   Un volume di ricerche elevato sulla data da' un piccolo boost.
 *
 * GATE DI SICUREZZA (dati certi):
 * - Addon `web_traffic` non attivo -> 5 (neutro).
 * - Hotel senza una baseline minima di ricerche sull'orizzonte -> 5 ovunque
 *   (non penalizziamo con falsi negativi gli hotel a basso traffico / appena
 *   attivati: "nessuna ricerca" diventa segnale solo quando c'e' abbastanza
 *   volume da renderlo affidabile).
 *
 * NB: default_weight=0 -> INERTE finche' non c'e' un weight override per-hotel
 * (attivazione dal tool Traffico web). Vedi calculate-suggested-price.ts.
 */
type DirectDemandCacheEntry = {
  active: boolean // addon attivo + baseline sufficiente
  byDate: Map<string, { searches: number; lastSearchedMs: number }>
  ts: number
}
const directDemandCache = new Map<string, DirectDemandCacheEntry>()
const DIRECT_DEMAND_TTL_MS = 5 * 60 * 1000
// Volume minimo di ricerche (somma su tutte le notti future) perche' il segnale
// per-data sia affidabile. Sotto questa soglia -> neutro 5 ovunque.
const DIRECT_DEMAND_MIN_TOTAL_SEARCHES = 8

async function loadDirectDemandData(
  hotelId: string,
  supabase: CalculationParams["supabase"],
): Promise<DirectDemandCacheEntry> {
  const cached = directDemandCache.get(hotelId)
  if (cached && Date.now() - cached.ts < DIRECT_DEMAND_TTL_MS) return cached

  const inactive = (): DirectDemandCacheEntry => ({ active: false, byDate: new Map(), ts: Date.now() })

  // Gate addon: senza "web_traffic" attivo la variabile resta neutra.
  const { data: sub } = await supabase
    .from("addon_subscriptions")
    .select("status")
    .eq("hotel_id", hotelId)
    .eq("addon_type", "web_traffic")
    .limit(1)
  const status = sub?.[0]?.status
  if (status !== "active" && status !== "trialing") {
    const entry = inactive()
    directDemandCache.set(hotelId, entry)
    return entry
  }

  // Carichiamo le ricerche per le notti dell'orizzonte (da oggi in avanti).
  const today = new Date().toISOString().split("T")[0]
  const { data: rows } = await supabase
    .from("site_search_daily")
    .select("stay_date, searches, last_searched_at")
    .eq("hotel_id", hotelId)
    .gte("stay_date", today)

  const byDate = new Map<string, { searches: number; lastSearchedMs: number }>()
  let totalSearches = 0
  for (const r of rows ?? []) {
    const s = Number(r.searches ?? 0)
    totalSearches += s
    byDate.set(String(r.stay_date), {
      searches: s,
      lastSearchedMs: r.last_searched_at ? new Date(r.last_searched_at).getTime() : 0,
    })
  }

  const entry: DirectDemandCacheEntry = {
    active: totalSearches >= DIRECT_DEMAND_MIN_TOTAL_SEARCHES,
    byDate,
    ts: Date.now(),
  }
  directDemandCache.set(hotelId, entry)
  return entry
}

async function calculateDirectDemand(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params

  const data = await loadDirectDemandData(hotelId, supabase)
  // Addon non attivo o baseline insufficiente -> neutro (dati certi).
  if (!data.active) return 5

  const dayMs = 24 * 60 * 60 * 1000
  const rec = data.byDate.get(date)

  // Data MAI cercata (ma l'hotel ha volume sufficiente): notte fredda -> K basso.
  if (!rec || rec.searches <= 0) return 2

  // Recency: quanti giorni dall'ultima ricerca per QUESTA data.
  const daysSince = Math.max(0, Math.floor((Date.now() - rec.lastSearchedMs) / dayMs))
  let value: number
  if (daysSince <= 1) value = 8
  else if (daysSince <= 3) value = 7
  else if (daysSince <= 7) value = 6
  else if (daysSince <= 14) value = 5
  else if (daysSince <= 21) value = 4
  else if (daysSince <= 30) value = 3
  else value = 2

  // Boost volume: piu' ricerche distinte sulla stessa notte = domanda piu' solida.
  if (value >= 5) {
    if (rec.searches >= 8) value = Math.min(10, value + 2)
    else if (rec.searches >= 3) value = Math.min(10, value + 1)
  }

  return value
}

/**
 * Calcolo compset (prezzi competitor) dal rate-shopper.
 *
 * 26/06/2026: attivate le due variabili compset, ferme da quando non avevamo il
 * monitoraggio prezzi. Ora alimentate dai dati REALI di `competitor_rates`
 * (popolata dal rate-shopper). Entrambi i calcolatori sono GATED: senza dati
 * sufficienti o freschi tornano 5 (neutro) -> mai valori inventati (regola dati
 * certi). Cache per-data per evitare query ripetute nel loop del cron.
 *
 * Freschezza: se l'ultima cattura del compset e' piu' vecchia di
 * COMPSET_STALE_DAYS giorni, consideriamo il dato inaffidabile -> neutro.
 */
const COMPSET_MIN_COMPETITORS = 2
const COMPSET_STALE_DAYS = 14

// Cache per-hotel della freschezza del compset (una query invece di 181).
const compsetFreshCache = new Map<string, { fresh: boolean; ts: number }>()
const COMPSET_FRESH_TTL_MS = 5 * 60 * 1000

async function isCompsetFresh(
  hotelId: string,
  supabase: CalculationParams["supabase"],
): Promise<boolean> {
  const cached = compsetFreshCache.get(hotelId)
  if (cached && Date.now() - cached.ts < COMPSET_FRESH_TTL_MS) return cached.fresh

  const { data } = await supabase
    .from("competitor_rates")
    .select("captured_at")
    .eq("hotel_id", hotelId)
    .order("captured_at", { ascending: false })
    .limit(1)

  const last = data?.[0]?.captured_at ? new Date(data[0].captured_at).getTime() : 0
  const ageDays = last ? (Date.now() - last) / (24 * 60 * 60 * 1000) : Infinity
  const fresh = ageDays <= COMPSET_STALE_DAYS
  compsetFreshCache.set(hotelId, { fresh, ts: Date.now() })
  return fresh
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Calculate k_compset_price_position (0-10)
 *
 * Confronta la NOSTRA tariffa piu' bassa del giorno (da pricing_grid) con la
 * MEDIANA dei prezzi competitor per la stessa data. Logica revenue:
 *   - siamo molto SOTTO il compset -> margine per alzare -> K alto (spinge su)
 *   - siamo allineati          -> K neutro (~5)
 *   - siamo molto SOPRA         -> rischio conversioni -> K basso
 * Gate: <2 competitor con prezzo, oppure dato stale, oppure nostro prezzo
 * mancante -> 5 (neutro).
 */
async function calculateCompsetPricePosition(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params

  if (!(await isCompsetFresh(hotelId, supabase))) return 5

  const { data: comp } = await supabase
    .from("competitor_rates")
    .select("price")
    .eq("hotel_id", hotelId)
    .eq("stay_date", date)
    .not("price", "is", null)

  const compPrices = (comp ?? []).map((c) => Number(c.price)).filter((p) => p > 0)
  if (compPrices.length < COMPSET_MIN_COMPETITORS) return 5

  // La nostra tariffa piu' bassa del giorno (entry-level), confrontabile con il
  // prezzo minimo scrapato dai competitor.
  const { data: ourRows } = await supabase
    .from("pricing_grid")
    .select("price")
    .eq("hotel_id", hotelId)
    .eq("date", date)
    .not("price", "is", null)

  const ourPrices = (ourRows ?? []).map((r) => Number(r.price)).filter((p) => p > 0)
  if (ourPrices.length === 0) return 5
  const ourLowest = Math.min(...ourPrices)

  const compMedian = median(compPrices)
  if (compMedian <= 0) return 5

  // scarto relativo: >0 siamo piu' cari, <0 siamo piu' economici
  const delta = (ourLowest - compMedian) / compMedian

  // Sotto compset = K alto. Soglie simmetriche calibrate su +/-20%.
  if (delta <= -0.2) return 10 // molto piu' economici -> forte spinta a salire
  if (delta <= -0.12) return 9
  if (delta <= -0.06) return 8
  if (delta <= -0.02) return 7
  if (delta < 0.02) return 5 // sostanzialmente allineati
  if (delta < 0.06) return 4
  if (delta < 0.12) return 3
  if (delta < 0.2) return 2
  return 1 // molto piu' cari -> raffreddare
}

/**
 * Calculate k_compset_occupancy (0-10)
 *
 * Proxy di pressione di mercato: percentuale di competitor SOLD-OUT per la data
 * (campo `availability=false` nel rate-shopper). Piu' competitor sono pieni,
 * piu' alta la pressione -> K alto. Gate: <2 competitor con disponibilita'
 * nota, oppure dato stale -> 5 (neutro).
 */
async function calculateCompsetOccupancy(params: CalculationParams): Promise<number> {
  const { hotelId, date, supabase } = params

  if (!(await isCompsetFresh(hotelId, supabase))) return 5

  const { data: comp } = await supabase
    .from("competitor_rates")
    .select("availability")
    .eq("hotel_id", hotelId)
    .eq("stay_date", date)
    .not("availability", "is", null)

  const flags = (comp ?? []).map((c) => c.availability as boolean)
  if (flags.length < COMPSET_MIN_COMPETITORS) return 5

  const soldOut = flags.filter((a) => a === false).length
  const soldOutRatio = soldOut / flags.length

  // 0% sold-out -> mercato libero (K basso); 100% sold-out -> massima pressione.
  return Math.round(Math.max(0, Math.min(1, soldOutRatio)) * 10)
}

// Variable configurations
const VARIABLE_CONFIGS: KVariableConfig[] = [
  { key: "k_occupancy_rate", calculate: calculateOccupancyRate, requiresExternalData: false, isAutomatic: true },
  { key: "k_lead_time", calculate: calculateLeadTime, requiresExternalData: false, isAutomatic: true },
  { key: "k_day_of_week", calculate: calculateDayOfWeek, requiresExternalData: false, isAutomatic: true },
  { key: "k_booking_pace", calculate: calculateBookingPace, requiresExternalData: false, isAutomatic: true },
  { key: "k_seasonality", calculate: calculateSeasonality, requiresExternalData: false, isAutomatic: true },
  { key: "k_cancellation_rate", calculate: calculateCancellationRate, requiresExternalData: false, isAutomatic: true },
  { key: "k_weather", calculate: calculateWeather, requiresExternalData: true, isAutomatic: false },
  { key: "k_reputation_score", calculate: calculateReputationScore, requiresExternalData: false, isAutomatic: true },
  // 13/05/2026: tre nuovi calcolatori per completare la copertura del registry.
  // Prima di oggi queste tre variabili erano nella settings UI ma senza codice
  // di calcolo -> il motore le vedeva fisse a default_weight (sempre uguali).
  { key: "k_holiday_national", calculate: calculateHolidayNational, requiresExternalData: false, isAutomatic: true },
  { key: "k_last_minute", calculate: calculateLastMinute, requiresExternalData: false, isAutomatic: true },
  { key: "k_pickup_trend", calculate: calculatePickupTrend, requiresExternalData: false, isAutomatic: true },
  // 13/05/2026 (sera): quarto calcolatore mancante - durata media soggiorno.
  // Prima di oggi pricing_algo_params.var_k_length_of_stay non veniva mai
  // scritto -> engine cadeva su default_weight=5 per ogni data -> in UI la
  // riga "Durata Media Soggiorno" era 5 fissa per tutto l'anno.
  { key: "k_length_of_stay", calculate: calculateLengthOfStay, requiresExternalData: false, isAutomatic: true },
  // 27/06/2026: domanda diretta PER-DATA dalle ricerche di soggiorno catturate
  // dal widget (site_search_daily). K legato a recency+volume delle ricerche per
  // quella notte. Gated (neutro 5 senza addon o baseline) e inerte finche' non
  // c'e' un weight override per-hotel (default_weight=0 nel catalogo).
  { key: "k_direct_demand", calculate: calculateDirectDemand, requiresExternalData: false, isAutomatic: true },
  // 26/06/2026: variabili compset (prezzi competitor) alimentate dal rate-shopper
  // (competitor_rates). Gated: neutro 5 senza dati sufficienti/freschi. Restano
  // non-attive di default (activeByDefault=false nel registry), si abilitano
  // dall'interfaccia variabili quando il monitoraggio prezzi e' attivo.
  { key: "k_compset_price_position", calculate: calculateCompsetPricePosition, requiresExternalData: true, isAutomatic: true },
  { key: "k_compset_occupancy", calculate: calculateCompsetOccupancy, requiresExternalData: true, isAutomatic: true },
]

/**
 * Calculate all automatic K variable values for a hotel and date
 */
export async function calculateKVariableValues(
  hotelId: string,
  date: string,
  variableKeys?: string[]
): Promise<Record<string, number>> {
  const supabase = await createServiceRoleClient()
  
  const params: CalculationParams = { hotelId, date, supabase }
  const results: Record<string, number> = {}
  
  const configsToCalculate = variableKeys
    ? VARIABLE_CONFIGS.filter(c => variableKeys.includes(c.key))
    : VARIABLE_CONFIGS.filter(c => c.isAutomatic)
  
  for (const config of configsToCalculate) {
    try {
      results[config.key] = await config.calculate(params)
    } catch (error) {
      console.error(`Error calculating ${config.key}:`, error)
      results[config.key] = 5 // Default on error
    }
  }
  
  return results
}

/**
 * Calculate the final K coefficient from weighted variables
 */
export function calculateFinalK(
  variableValues: Record<string, number>,
  variableWeights: Record<string, number>
): number {
  let totalWeightedValue = 0
  let totalWeight = 0
  
  for (const [key, value] of Object.entries(variableValues)) {
    const weight = variableWeights[key] ?? 5
    totalWeightedValue += value * weight
    totalWeight += weight
  }
  
  if (totalWeight === 0) return 5
  
  // Normalize to 0-10 scale
  const rawK = totalWeightedValue / totalWeight
  return Math.round(Math.max(0, Math.min(10, rawK)))
}

/**
 * Store calculated K values in the database
 *
 * FIX 12/05/2026 (Architettura Ufficiale Santaddeo - Sistema A → Sistema B BRIDGE):
 * Oltre a popolare `k_variable_values` (storico/audit Sistema A), questa funzione
 * ora SCRIVE anche in `pricing_algo_params` con `param_key = 'var_${variable_key}'`,
 * cosi' i valori auto-calcolati alimentano DAVVERO il motore pricing ufficiale
 * (calculateK in calculate-suggested-price.ts legge proprio da li').
 *
 * Prima del fix: i K values calcolati dal cron finivano solo in k_variable_values
 * (orfani). Il motore prezzi non li vedeva. Il tenant doveva inserirli manualmente
 * nella UI pricing per ogni data. Sistema A e Sistema B erano scollegati.
 *
 * Dopo il fix: ogni calcolo K viene mirrorato in pricing_algo_params, quindi:
 *   - k_occupancy_rate → var_k_occupancy_rate (key con prefisso var_)
 *   - k_lead_time      → var_k_lead_time
 *   - ... etc.
 * Il motore prezzi (modalita' K-DRIVEN) li riceve automaticamente per ogni data.
 *
 * IMPORTANTE: solo le righe corrispondenti a `pricing_variables.variable_key`
 * attive per quell'hotel vengono effettivamente USATE dal motore. Le altre
 * restano in pricing_algo_params come "dato disponibile" ma inerti.
 */
export async function storeKVariableValues(
  hotelId: string,
  date: string,
  values: Record<string, number>
): Promise<void> {
  const supabase = await createServiceRoleClient()

  // Sistema A: storico K values (audit + UI superadmin diagnostics)
  // 13/05/2026: la colonna `calculated_value` di k_variable_values e' INTEGER,
  // quindi valori decimali (es. k_reputation_score=9.48) causavano errore
  // silenzioso "invalid input syntax for type integer" e la riga non veniva
  // mai scritta. Arrotondiamo qui — il bridge verso pricing_algo_params (TEXT)
  // qui sotto continua a ricevere il valore originale a precisione piena,
  // quindi il motore prezzi vede comunque 9.48 corretto.
  for (const [key, value] of Object.entries(values)) {
    const { error: storeError } = await supabase
      .from("k_variable_values")
      .upsert({
        hotel_id: hotelId,
        date: date,
        variable_key: key,
        calculated_value: Math.round(value),
        updated_at: new Date().toISOString()
      }, { onConflict: "hotel_id,date,variable_key" })
    if (storeError) {
      console.error(
        `[k-vars][store] hotel=${hotelId} date=${date} key=${key} value=${value} -> ${storeError.message}`
      )
    }
  }

  // Sistema A → Sistema B BRIDGE: mirror in pricing_algo_params.
  // Il motore prezzi legge da pricing_algo_params[`var_${variable_key}`][date].
  // Manteniamo i valori in scala 0-10 (stessa scala usata da calculateK).
  const bridgeRows = Object.entries(values).map(([key, value]) => ({
    hotel_id: hotelId,
    date: date,
    param_key: `var_${key}`,
    param_value: String(value),
    updated_at: new Date().toISOString(),
  }))

  if (bridgeRows.length > 0) {
    const { error: bridgeError } = await supabase
      .from("pricing_algo_params")
      .upsert(bridgeRows, { onConflict: "hotel_id,date,param_key" })

    if (bridgeError) {
      console.error(
        `[k-vars][bridge] hotel=${hotelId} date=${date} failed to mirror to pricing_algo_params:`,
        bridgeError.message
      )
      // Non rilanciare: il fallimento del bridge non deve bloccare il calcolo K (Sistema A
      // resta valido come storico). Il motore prezzi semplicemente non vedra' questi K values
      // per questa data fino al prossimo recalc.
    }
  }
}

/**
 * Calculate all K variables for a hotel and date (used by API routes)
 * Returns both individual variable values and the total weighted K
 */
export async function calculateAllKVariables(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  hotelId: string,
  date: string,
  variableWeights?: Record<string, number>
): Promise<{ variables: Record<string, number>; totalK: number }> {
  const params: CalculationParams = { hotelId, date, supabase }
  const variables: Record<string, number> = {}
  
  for (const config of VARIABLE_CONFIGS) {
    try {
      variables[config.key] = await config.calculate(params)
    } catch (error) {
      console.error(`[v0] Error calculating ${config.key}:`, error)
      variables[config.key] = 5 // Default on error
    }
  }
  
  // Calculate total K using weights (default weight = 5 for all)
  const weights = variableWeights || Object.fromEntries(
    VARIABLE_CONFIGS.map(c => [c.key, 5])
  )
  
  const totalK = calculateFinalK(variables, weights)
  
  return { variables, totalK }
}
