import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

/**
 * GET /api/dati/commissions?hotel_id=...&year=YYYY
 *
 * Calcola produzione mensile dalla sorgente corretta in base al PMS:
 *  - Scidoo:  scidoo_raw_bookings (raw_data + statics[])
 *  - Altri:   public.bookings (con synth raw_data.daily_price pro-rata)
 *  - PY fallback: daily_production (manual_import_2025) per hotel onboardati
 *    di recente. Stesso pattern di /api/dati/objectives e /api/dati/analytics.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotel_id")
    const yearStr = sp.get("year")
    if (!hotelId || !yearStr) {
      return NextResponse.json({ error: "hotel_id and year required" }, { status: 400 })
    }
    const year = parseInt(yearStr)
    if (Number.isNaN(year)) return NextResponse.json({ error: "Invalid year" }, { status: 400 })

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied

    const supabase = await createServiceRoleClient()

    // 1) Subscription
    const { data: sub } = await supabase
      .from("accelerator_subscriptions")
      .select("id, plan_type, commission_percentage, is_active, started_at")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    if (!sub || sub.plan_type !== "commission") {
      return NextResponse.json({ enabled: false, reason: "not_commission_plan" })
    }

    // 2) Periodi commissione
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const prevYearStart = `${year - 1}-01-01`
    const prevYearEnd = `${year - 1}-12-31`
    
    const { data: periods } = await supabase
      .from("subscription_commission_periods")
      .select("valid_from, valid_to, commission_percentage, commission_basis")
      .eq("subscription_id", sub.id)
      .or(`valid_to.is.null,valid_to.gte.${yearStart}`)
      .lte("valid_from", yearEnd)
      .order("valid_from", { ascending: true })

    const periodForDate = (isoDate: string): { pct: number | null; basis: "total" | "delta" } => {
      for (const p of periods || []) {
        if (p.valid_from <= isoDate && (p.valid_to == null || p.valid_to >= isoDate)) {
          return { pct: Number(p.commission_percentage), basis: (p.commission_basis as "total" | "delta") || "total" }
        }
      }
      // FIX 21/05/2026: il fallback su sub.commission_percentage si applica
      // SOLO da `started_at` in avanti (data di attivazione del piano
      // commission). Cosi' una notte di gennaio per un hotel attivato a
      // giugno non viene piu' fatturata sull'intero anno. Se l'utente vuole
      // un cutoff diverso da `started_at`, deve creare un periodo con
      // `valid_from` sulla data desiderata in `subscription_commission_periods`.
      const startedDate = sub.started_at ? String(sub.started_at).slice(0, 10) : null
      if (startedDate && isoDate < startedDate) {
        return { pct: null, basis: "total" }
      }
      return { pct: sub.commission_percentage != null ? Number(sub.commission_percentage) : null, basis: "total" }
    }

    // 3) Status validi per produzione
    // "opzione" va contata SOLO se checkin_date >= oggi (prenotazione futura potenziale)
    const CONFIRMED_STATUSES = [
      "attesa_pagamento",
      "confermata",
      "confermata_manuale",
      "confermata_pagamento",
      "confermata_carta",
      "check_in",
      "saldo",
      "check_out",
    ]
    const today = new Date().toISOString().slice(0, 10)

    // 3b) PMS detection — solo Scidoo legge da scidoo_raw_bookings; gli altri
    // (BRiG, gsheets/Bedzzle, ...) leggono da public.bookings. Stessa regola
    // gia' applicata in /api/dati/objectives e /api/dati/analytics. Vedi
    // MEMORY: "AI Report tutto a zero per hotel BRiG: branch isApiMode".
    const { data: pmsConfig } = await supabase
      .from("pms_integrations")
      .select("integration_mode, pms_name")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()
    const pmsName = String(pmsConfig?.pms_name || "").toLowerCase()
    const isScidoo = pmsName === "scidoo"

    // Helper per filtrare booking con Pernotto o daily_price
    const hasValidPriceData = (b: any) => {
      const statics: any[] = Array.isArray(b.raw_data?.statics) ? b.raw_data.statics : []
      const hasPernotto = statics.some((s) => s && s.category === "Pernotto")
      const dp = b.raw_data?.daily_price
      const hasDailyPrice = dp && typeof dp === "object" && !Array.isArray(dp) && Object.keys(dp).length > 0
      return hasPernotto || hasDailyPrice
    }

    // 4) Fetch booking corrente + precedente. Branch su Scidoo vs altri PMS.
    let curBookings: any[] = []
    let prevBookings: any[] = []

    if (isScidoo) {
      // Scidoo: confermati + opzioni future per anno corrente, confermati per PY
      const [{ data: curConfirmed }, { data: curOptions }, { data: prevRawBookings }] = await Promise.all([
        supabase
          .from("scidoo_raw_bookings")
          .select("id, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date, status")
          .eq("hotel_id", hotelId)
          .lte("checkin_date", yearEnd)
          .gt("checkout_date", yearStart)
          .in("status", CONFIRMED_STATUSES),
        supabase
          .from("scidoo_raw_bookings")
          .select("id, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date, status")
          .eq("hotel_id", hotelId)
          .lte("checkin_date", yearEnd)
          .gt("checkout_date", yearStart)
          .eq("status", "opzione")
          .gte("checkin_date", today),
        supabase
          .from("scidoo_raw_bookings")
          .select("id, room_type_code, checkin_date, checkout_date, total_amount, raw_data, booking_date, status")
          .eq("hotel_id", hotelId)
          .lte("checkin_date", prevYearEnd)
          .gt("checkout_date", prevYearStart)
          .in("status", CONFIRMED_STATUSES),
      ])
      curBookings = [...(curConfirmed || []), ...(curOptions || [])].filter(hasValidPriceData)
      prevBookings = (prevRawBookings || []).filter(hasValidPriceData)
    } else {
      // Non-Scidoo (BRiG/gsheets/...): leggiamo da public.bookings e
      // sintetizziamo raw_data.daily_price pro-rata su (total_price - extras)
      // / nights, identico a /api/dati/analytics e /api/dati/objectives.
      const mapBooking = (b: any) => {
        const nights = Number(b.number_of_nights) || 0
        const extrasTotal =
          (Number(b.extras_revenue) || 0) +
          (Number(b.fb_revenue) || 0) +
          (Number(b.spa_revenue) || 0) +
          (Number(b.other_revenue) || 0)
        const totalPrice = Number(b.total_price) || 0
        const roomOnlyTotal = Math.max(0, totalPrice - extrasTotal)
        const roomNightly = nights > 0 ? roomOnlyTotal / nights : 0
        let dp: Record<string, number> | null = null
        if (roomNightly > 0 && b.check_in_date && b.check_out_date) {
          dp = {}
          const ci = new Date(b.check_in_date)
          const co = new Date(b.check_out_date)
          for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
            dp[d.toISOString().slice(0, 10)] = roomNightly
          }
        }
        return {
          checkin_date: b.check_in_date,
          checkout_date: b.check_out_date,
          total_amount: totalPrice,
          booking_date: b.booking_date,
          raw_data: { daily_price: dp },
          status: b.is_cancelled ? "annullata" : "confermata",
        }
      }
      const bookingCols =
        "id, check_in_date, check_out_date, total_price, number_of_nights, extras_revenue, fb_revenue, spa_revenue, other_revenue, is_cancelled, booking_date"
      const [{ data: curRaw }, { data: prevRaw }] = await Promise.all([
        supabase
          .from("bookings")
          .select(bookingCols)
          .eq("hotel_id", hotelId)
          .eq("is_cancelled", false)
          .lte("check_in_date", yearEnd)
          .gt("check_out_date", yearStart),
        supabase
          .from("bookings")
          .select(bookingCols)
          .eq("hotel_id", hotelId)
          .eq("is_cancelled", false)
          .lte("check_in_date", prevYearEnd)
          .gt("check_out_date", prevYearStart),
      ])
      curBookings = (curRaw || []).map(mapBooking).filter(hasValidPriceData)
      prevBookings = (prevRaw || []).map(mapBooking).filter(hasValidPriceData)
    }

    // 6) STESSA FUNZIONE extractDailyPrices DI OBIETTIVI (copia esatta)
    function extractDailyPrices(booking: any): Array<{ date: string; price: number }> {
      const entries: Array<{ date: string; price: number }> = []
      const statics: any[] = Array.isArray(booking.raw_data?.statics) ? booking.raw_data.statics : []
      const pernottoEntries = statics.filter((s) => s && s.category === "Pernotto")
      if (pernottoEntries.length > 0) {
        for (const s of pernottoEntries) {
          const dt = String(s.date_time || "").slice(0, 10)
          if (!dt) continue
          const price = Number(s.price) || 0
          if (price === 999 || price === 9999) continue
          entries.push({ date: dt, price })
        }
        return entries
      }
      const rawDp = booking.raw_data?.daily_price
      const dailyPrice = (rawDp && typeof rawDp === 'object' && !Array.isArray(rawDp) && Object.keys(rawDp).length > 0)
        ? rawDp as Record<string, number>
        : null
      if (dailyPrice) {
        const extras: any[] = Array.isArray(booking.raw_data?.extras) ? booking.raw_data.extras : []
        const totalDiscount = extras.reduce((sum: number, ex: any) => {
          const price = Number(ex.price) || 0
          if (price >= 0) return sum
          const cat = String(ex.category || "").toLowerCase()
          const desc = String(ex.description || "").toLowerCase()
          const isDiscount = cat.includes("sconti") || cat.includes("servizio nota") || desc.includes("sconto") || desc.includes("addebito libero")
          return isDiscount ? sum + price : sum
        }, 0)
        const dpTotal = Object.values(dailyPrice).reduce((s: number, v) => {
          const n = Number(v) || 0
          return s + (n > 0 && n !== 999 && n !== 9999 ? n : 0)
        }, 0)
        for (const [date, price] of Object.entries(dailyPrice)) {
          if (price === 999 || price === 9999) continue
          const grossPrice = price || 0
          const discountShare = dpTotal > 0 ? (grossPrice / dpTotal) * totalDiscount : 0
          entries.push({ date, price: grossPrice + discountShare })
        }
      } else if (booking.checkin_date && booking.checkout_date) {
        const checkin = new Date(booking.checkin_date)
        const checkout = new Date(booking.checkout_date)
        const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24))
        if (nights <= 0) return entries
        const totalAmount = booking.total_amount || 0
        const pricePerNight = totalAmount / nights
        const effectivePrice = (pricePerNight === 999 || pricePerNight === 9999) ? 0 : pricePerNight
        for (let d = new Date(checkin); d < checkout; d.setDate(d.getDate() + 1)) {
          entries.push({ date: d.toISOString().split("T")[0], price: effectivePrice })
        }
      }
      return entries
    }

    // 7) Aggrega produzione per mese usando extractDailyPrices
    const monthly: Array<{
      month: number
      currentRevenue: number
      prevRevenue: number
      commissionPercentage: number | null
      commissionPercentages: number[]
      commissionAmount: number
    }> = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      currentRevenue: 0,
      prevRevenue: 0,
      commissionPercentage: null,
      commissionPercentages: [],
      commissionAmount: 0,
    }))

    const monthPctSet: Record<number, Set<number>> = {}
    for (let m = 1; m <= 12; m++) monthPctSet[m] = new Set()

    const dailyRevenue: Record<number, { date: string; rev: number; pct: number | null; basis: "total" | "delta" }[]> = {}
    for (let m = 1; m <= 12; m++) dailyRevenue[m] = []

    // Anno corrente: estrai daily prices e aggrega per mese
    for (const booking of curBookings) {
      const dailyPrices = extractDailyPrices(booking)
      for (const { date, price } of dailyPrices) {
        if (date < yearStart || date > yearEnd) continue
        // Parsing diretto della stringa YYYY-MM-DD per evitare problemi di timezone
        const m = parseInt(date.slice(5, 7), 10)
        monthly[m - 1].currentRevenue += price
        const period = periodForDate(date)
        if (period.pct != null) monthPctSet[m].add(period.pct)
        dailyRevenue[m].push({ date, rev: price, pct: period.pct, basis: period.basis })
      }
    }

    // Anno precedente: estrai daily prices e aggrega per mese
    for (const booking of prevBookings) {
      const dailyPrices = extractDailyPrices(booking)
      for (const { date, price } of dailyPrices) {
        if (date < prevYearStart || date > prevYearEnd) continue
        // Parsing diretto della stringa YYYY-MM-DD per evitare problemi di timezone
        const m = parseInt(date.slice(5, 7), 10)
        monthly[m - 1].prevRevenue += price
      }
    }

    // 7b) Fallback PY storico da `daily_production` per hotel onboardati di
    // recente (es. Cavallino 2025: solo manual_import_2025, niente bookings).
    // Stesso pattern di /api/dati/objectives e /api/dati/analytics.
    const prevTotal = monthly.reduce((s, m) => s + m.prevRevenue, 0)
    if (prevTotal === 0) {
      const { data: prevDpRows } = await supabase
        .from("daily_production")
        .select("date, total_revenue")
        .eq("hotel_id", hotelId)
        .gte("date", prevYearStart)
        .lte("date", prevYearEnd)
      for (const row of prevDpRows || []) {
        const dateStr = String(row.date || "").slice(0, 10)
        if (!dateStr) continue
        const m = parseInt(dateStr.slice(5, 7), 10)
        if (Number.isNaN(m) || m < 1 || m > 12) continue
        monthly[m - 1].prevRevenue += Number(row.total_revenue) || 0
      }
    }

    // 8) Calcola commissione
    for (let m = 1; m <= 12; m++) {
      const days = dailyRevenue[m]
      const currentRev = monthly[m - 1].currentRevenue
      const prevRev = monthly[m - 1].prevRevenue
      const monthDelta = currentRev - prevRev
      
      const totalBasisDays = days.filter(d => d.basis === "total")
      const deltaBasisDays = days.filter(d => d.basis === "delta")
      
      for (const day of totalBasisDays) {
        if (day.pct != null) {
          monthly[m - 1].commissionAmount += (day.rev * day.pct) / 100
        }
      }
      
      if (deltaBasisDays.length > 0 && monthDelta > 0) {
        const deltaDaysRev = deltaBasisDays.reduce((sum, d) => sum + d.rev, 0)
        const deltaDaysShare = currentRev > 0 ? deltaDaysRev / currentRev : 0
        const attributedDelta = monthDelta * deltaDaysShare
        let weightedPctSum = 0
        let totalRevDelta = 0
        for (const day of deltaBasisDays) {
          if (day.pct != null && day.rev > 0) {
            weightedPctSum += day.pct * day.rev
            totalRevDelta += day.rev
          }
        }
        const avgPct = totalRevDelta > 0 ? weightedPctSum / totalRevDelta : 0
        monthly[m - 1].commissionAmount += (attributedDelta * avgPct) / 100
      }
    }

    for (let m = 1; m <= 12; m++) {
      const set = Array.from(monthPctSet[m])
      monthly[m - 1].commissionPercentages = set
      monthly[m - 1].commissionPercentage = set.length === 1 ? set[0] : null
    }

    // 9) Invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, period_start, period_end, status, total")
      .eq("hotel_id", hotelId)
      .gte("period_start", yearStart)
      .lte("period_end", yearEnd)

    const invoicesByMonth: Record<number, Array<{ id: string; invoice_number: string; status: string; total: number }>> = {}
    for (const inv of invoices || []) {
      const refDate = inv.period_end || inv.period_start
      if (!refDate) continue
      const m = new Date(refDate).getUTCMonth() + 1
      if (!invoicesByMonth[m]) invoicesByMonth[m] = []
      invoicesByMonth[m].push({ id: inv.id, invoice_number: inv.invoice_number, status: inv.status, total: Number(inv.total) || 0 })
    }

    return NextResponse.json({
      enabled: true,
      year,
      subscription: { id: sub.id, plan_type: sub.plan_type, currentPercentage: sub.commission_percentage, startedAt: sub.started_at },
      periods: periods || [],
      months: monthly.map((m) => ({
        ...m,
        deltaYoy: m.currentRevenue - m.prevRevenue,
        deltaYoyPct: m.prevRevenue > 0 ? ((m.currentRevenue - m.prevRevenue) / m.prevRevenue) * 100 : null,
        invoices: invoicesByMonth[m.month] || [],
      })),
    })
  } catch (error) {
    console.error("[/api/dati/commissions] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
