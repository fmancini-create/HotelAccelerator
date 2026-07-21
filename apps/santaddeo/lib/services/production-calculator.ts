/**
 * Production Calculator - Calcola la produzione camere dai booking reali
 * 
 * Fonte di verità: scidoo_raw_bookings (per hotel API) o bookings (per altri)
 * 
 * NOTA: daily_production contiene dati FISCALI (fatture/depositi) che sono DIVERSI
 * dalla produzione reale delle camere. Per metriche accurate di produzione camere
 * (Obiettivi, Commissioni, Analytics), usare sempre questo servizio.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface MonthlyProduction {
  month: number // 1-12
  revenue: number
  roomNights: number
}

export interface DailyProduction {
  date: string // YYYY-MM-DD
  revenue: number
  roomNights: number
}

interface ProductionResult {
  monthly: MonthlyProduction[]
  daily: DailyProduction[]
  total: number
}

/**
 * Helper per fetchare tutti i record con paginazione
 */
async function fetchAll<T>(
  queryFn: () => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const { data, error } = await queryFn()
  if (error) {
    console.error("[ProductionCalculator] Query error:", error.message)
    return []
  }
  return data || []
}

/**
 * Estrae i prezzi giornalieri da un booking Scidoo.
 * SOURCE OF TRUTH: raw_data.statics[] dove category === "Pernotto".
 * Fallback: daily_price con sconti applicati dagli extras.
 * Questa logica è IDENTICA a quella usata in Obiettivi per garantire
 * che i numeri corrispondano esattamente.
 */
function extractDailyPrices(booking: any): Array<{ date: string; price: number }> {
  const entries: Array<{ date: string; price: number }> = []
  const statics: any[] = Array.isArray(booking.raw_data?.statics) ? booking.raw_data.statics : []
  const pernottoEntries = statics.filter((s) => s && s.category === "Pernotto")
  
  // Prima opzione: usa statics.Pernotto (fonte di verità)
  if (pernottoEntries.length > 0) {
    for (const s of pernottoEntries) {
      const dt = String(s.date_time || "").slice(0, 10)
      if (!dt) continue
      const price = Number(s.price) || 0
      // Skip Scidoo placeholder values
      if (price === 999 || price === 9999) continue
      entries.push({ date: dt, price })
    }
    return entries
  }
  
  // Fallback: daily_price con sconti dagli extras
  const rawDp = booking.raw_data?.daily_price
  const dailyPrice = (rawDp && typeof rawDp === 'object' && !Array.isArray(rawDp) && Object.keys(rawDp).length > 0)
    ? rawDp as Record<string, number>
    : null
    
  if (dailyPrice) {
    // Calcola sconti negativi dagli extras
    const extras: any[] = Array.isArray(booking.raw_data?.extras) ? booking.raw_data.extras : []
    const totalDiscount = extras.reduce((sum: number, ex: any) => {
      const price = Number(ex.price) || 0
      if (price >= 0) return sum
      const cat = String(ex.category || "").toLowerCase()
      const desc = String(ex.description || "").toLowerCase()
      const isDiscount =
        cat.includes("sconti") ||
        cat.includes("servizio nota") ||
        desc.includes("sconto") ||
        desc.includes("addebito libero")
      return isDiscount ? sum + price : sum
    }, 0)
    
    const dpTotal = Object.values(dailyPrice).reduce((s: number, v) => {
      const n = Number(v) || 0
      return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
    }, 0)
    const discountRatio = dpTotal > 0 ? (dpTotal + totalDiscount) / dpTotal : 1
    
    for (const [dateStr, rawPrice] of Object.entries(dailyPrice)) {
      const n = Number(rawPrice) || 0
      if (n <= 0 || n === 999 || n === 9999) continue
      entries.push({ date: dateStr, price: n * discountRatio })
    }
    return entries
  }
  
  // Ultimo fallback: pro-rata da total_amount
  const checkin = booking.checkin_date
  const checkout = booking.checkout_date
  if (checkin && checkout) {
    const ci = new Date(checkin)
    const co = new Date(checkout)
    const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000))
    const totalAmount = Number(booking.total_amount) || 0
    const perNight = totalAmount / nights
    
    for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
      entries.push({ date: d.toISOString().slice(0, 10), price: perNight })
    }
  }
  
  return entries
}

/**
 * Calcola la produzione camere per un hotel e un anno specifico
 * usando i booking reali (non i dati fiscali)
 */
export async function calculateYearlyProduction(
  supabase: SupabaseClient,
  hotelId: string,
  year: number,
  options?: {
    statusFilter?: Set<string>
  }
): Promise<ProductionResult> {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const statusFilter = options?.statusFilter

  // Determina se l'hotel usa API mode (scidoo_raw_bookings) o tabella bookings
  const { data: pmsIntegration } = await supabase
    .from("pms_integrations")
    .select("id, pms_name, config")
    .eq("hotel_id", hotelId)
    .eq("pms_name", "scidoo")
    .maybeSingle()

  const isApiMode = !!pmsIntegration?.config &&
    typeof pmsIntegration.config === "object" &&
    (pmsIntegration.config as any).mode === "api"

  // Inizializza strutture risultato
  const monthly: MonthlyProduction[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    revenue: 0,
    roomNights: 0,
  }))
  
  const dailyMap = new Map<string, { revenue: number; roomNights: number }>()

  if (isApiMode) {
    // Usa scidoo_raw_bookings (dati reali dal PMS)
    const rawBookings = await fetchAll(() => {
      let q = supabase
        .from("scidoo_raw_bookings")
        .select("id, checkin_date, checkout_date, total_amount, raw_data, status")
        .eq("hotel_id", hotelId)
        .lte("checkin_date", yearEnd)
        .gt("checkout_date", yearStart)
      if (statusFilter && statusFilter.size > 0) {
        q = q.in("status", Array.from(statusFilter))
      }
      return q
    })

    // Filtra solo booking con camere reali (Pernotto o daily_price)
    const validBookings = rawBookings.filter((b: any) => {
      const statics: any[] = Array.isArray(b.raw_data?.statics) ? b.raw_data.statics : []
      const hasPernotto = statics.some((s) => s && s.category === "Pernotto")
      const dp = b.raw_data?.daily_price
      const hasDailyPrice = dp && typeof dp === "object" && !Array.isArray(dp) && Object.keys(dp).length > 0
      return hasPernotto || hasDailyPrice
    })

    // Aggrega per giorno usando la stessa logica di Obiettivi
    for (const booking of validBookings) {
      const dailyEntries = extractDailyPrices(booking)
      
      for (const { date: dateStr, price } of dailyEntries) {
        if (dateStr < yearStart || dateStr > yearEnd) continue
        if (price <= 0) continue
        
        const existing = dailyMap.get(dateStr) || { revenue: 0, roomNights: 0 }
        existing.revenue += price
        existing.roomNights += 1
        dailyMap.set(dateStr, existing)
      }
    }
  } else {
    // Usa tabella bookings (per hotel non-Scidoo)
    const bookings = await fetchAll(() =>
      supabase
        .from("bookings")
        .select("id, check_in_date, check_out_date, total_price, price_per_night, number_of_nights, extras_revenue, fb_revenue, spa_revenue, other_revenue")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .lte("check_in_date", yearEnd)
        .gt("check_out_date", yearStart)
    )

    for (const booking of bookings) {
      const checkin = new Date(booking.check_in_date)
      const checkout = new Date(booking.check_out_date)
      const nights = Number(booking.number_of_nights) || Math.max(1, Math.round((checkout.getTime() - checkin.getTime()) / 86400000))
      
      // Calcola revenue camere (esclusi extras)
      const extrasTotal =
        (Number(booking.extras_revenue) || 0) +
        (Number(booking.fb_revenue) || 0) +
        (Number(booking.spa_revenue) || 0) +
        (Number(booking.other_revenue) || 0)
      const totalPrice = Number(booking.total_price) || 0
      const roomOnlyTotal = Math.max(0, totalPrice - extrasTotal)
      const perNight = nights > 0 ? roomOnlyTotal / nights : Number(booking.price_per_night) || 0

      for (let d = new Date(checkin); d < checkout; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10)
        if (dateStr < yearStart || dateStr > yearEnd) continue
        
        const existing = dailyMap.get(dateStr) || { revenue: 0, roomNights: 0 }
        existing.revenue += perNight
        existing.roomNights += 1
        dailyMap.set(dateStr, existing)
      }
    }
  }

  // Converto daily map in array e aggrego per mese
  const daily: DailyProduction[] = []
  let total = 0

  for (const [dateStr, data] of dailyMap) {
    daily.push({ date: dateStr, revenue: data.revenue, roomNights: data.roomNights })
    
    const m = new Date(dateStr).getUTCMonth() // 0-11
    monthly[m].revenue += data.revenue
    monthly[m].roomNights += data.roomNights
    total += data.revenue
  }

  // Ordina daily per data
  daily.sort((a, b) => a.date.localeCompare(b.date))

  return { monthly, daily, total }
}
