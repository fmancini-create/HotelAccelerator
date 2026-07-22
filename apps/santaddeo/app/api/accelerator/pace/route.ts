import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import {
  fetchPaceBookings,
  computeOtb,
  sumOtb,
  addDays,
  daysBetween,
  toISODate,
  type OtbCell,
} from "@/lib/pace/compute"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { getHotelVatConfig, scorporoMonetaryDeep, resolveVatConfig, parseVatViewParam } from "@/lib/utils/vat-display"
import { analyzePace, DEFAULT_ANALYZER_CONFIG, type AnalyzerMonthInput } from "@/lib/pace/analyzer"
import {
  CATEGORY_TO_SLUG,
  DEFAULT_COMMISSION_PCT as DEFAULT_COMMISSION_PCT_BY_SLUG,
  type ChannelCategorySlug,
} from "@/lib/pace/channel-commissions"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/accelerator/pace", handleGET)

// Allineamento STLY: -364 giorni mantiene lo stesso giorno della settimana.
const STLY_OFFSET = 364
const CURVE_WEEKS = 12

// Limita la frazione di curva: minimo 8% per evitare proiezioni esplosive a
// lead time molto lunghi (otb/0.02 = numeri assurdi), massimo 100%.
const clampFrac = (f: number): number => Math.min(1, Math.max(0.08, f))

// Categoria di canale per la segmentazione RMS. Raggruppa la lunga coda di nomi
// (agenzie, tour operator, nomi ospite dal sync Scidoo) in 4 macro-classi utili
// al revenue manager: il diretto e' a margine pieno, le OTA pagano commissione.
type ChannelCategory = "Diretto" | "OTA" | "Tour Operator / Agenzie" | "Altro"
const OTA_PATTERNS =
  /booking|expedia|airbnb|hrs|hotelbeds|agoda|despegar|lastminute|venere|hotel\.?com|google|trivago|edreams|opodo|travel ?republic|ctrip|trip\.com|weekend/i
function categorizeChannel(channel: string | null, isDirect: boolean | null): ChannelCategory {
  if (isDirect) return "Diretto"
  const c = (channel ?? "").trim().toLowerCase()
  if (!c || c === "direct" || c === "diretto" || c.includes("diretta") || c.includes("website") || c.includes("sito"))
    return "Diretto"
  if (OTA_PATTERNS.test(c)) return "OTA"
  // S.R.L., S.P.A., tour, viaggi, cruises, group -> agenzie/TO
  if (/s\.?r\.?l|s\.?p\.?a|tour|viagg|cruise|group|gruppo|travel|adventure/i.test(c))
    return "Tour Operator / Agenzie"
  return "Altro"
}

// Commissione % di default per categoria spostata in lib/pace/channel-commissions.ts
// (condivisa col route /commissions). Qui usiamo DEFAULT_COMMISSION_PCT_BY_SLUG.

interface ChannelBooking {
  booking_date: string | null
  check_in_date: string | null
  check_out_date: string | null
  is_cancelled: boolean | null
  number_of_rooms: number | null
  number_of_nights: number | null
  total_price: number | null
  net_price: number | null
  extras_revenue: number | null
  channel: string | null
  is_direct: boolean | null
  commission_amount: number | null
  commission_rate: number | null
}

async function handleGET(request: NextRequest) {
  // Short-circuit keep-warm (prima di auth/DB)
  if (request.nextUrl.searchParams.get("warm") === "1") {
    return NextResponse.json({ ok: true, warm: true })
  }

  try {
    const { searchParams } = request.nextUrl
    const hotelId = searchParams.get("hotelId")
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    }

    // Bypass auth per il cron interno (pace-analyzer): autenticato via header
    // segreto. L'addon gating sotto resta comunque attivo. In dev/preview
    // (nessun CRON_SECRET) il bypass non si attiva e vale l'auth normale.
    const cronSecret = process.env.CRON_SECRET
    const isInternalCron =
      !!cronSecret && request.headers.get("x-cron-secret") === cronSecret
    if (!isInternalCron) {
      const denied = await validateHotelAccess(hotelId, null, { allowSeller: "full" })
      if (denied) return denied
    }

    if (!(await hasAddon(hotelId, "booking_pace"))) {
      return NextResponse.json({ error: "Addon Booking Pace non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
    }

    const today = toISODate(new Date())
    const from = searchParams.get("from") || today
    const to = searchParams.get("to") || addDays(today, 90)

    const supabase = await createServiceRoleClient()

    // Finestre notti: anno corrente + stesso periodo anno scorso (STLY)
    const lyFrom = addDays(from, -STLY_OFFSET)
    const lyTo = addDays(to, -STLY_OFFSET)

    const [cyBookings, lyBookings] = await Promise.all([
      fetchPaceBookings(supabase, hotelId, from, addDays(to, 1)),
      fetchPaceBookings(supabase, hotelId, lyFrom, addDays(lyTo, 1)),
    ])

    // --- OTB correnti e a ritroso per il pickup ---
    const otbToday = computeOtb(cyBookings, today, from, addDays(to, 1))
    const otb1 = computeOtb(cyBookings, addDays(today, -1), from, addDays(to, 1))
    const otb3 = computeOtb(cyBookings, addDays(today, -3), from, addDays(to, 1))
    const otb7 = computeOtb(cyBookings, addDays(today, -7), from, addDays(to, 1))
    const otb14 = computeOtb(cyBookings, addDays(today, -14), from, addDays(to, 1))
    const otb30 = computeOtb(cyBookings, addDays(today, -30), from, addDays(to, 1))

    // STLY: OTB dell'anno scorso allo stesso lead time (asOf = oggi - 364)
    const otbStly = computeOtb(lyBookings, addDays(today, -STLY_OFFSET), lyFrom, addDays(lyTo, 1))

    const curTot = sumOtb(otbToday)
    const stlyTot = sumOtb(otbStly)
    const tot1 = sumOtb(otb1)
    const tot3 = sumOtb(otb3)
    const tot7 = sumOtb(otb7)
    const tot14 = sumOtb(otb14)
    const tot30 = sumOtb(otb30)

    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)

    // --- Pickup per DATA DI SOGGIORNO (report di portafoglio) ---
    // Per ogni notte futura, quante camere/ricavo sono stati aggiunti (o persi
    // per cancellazione) rispetto a 1/3/7 giorni fa. Riusa le mappe OTB per-notte
    // gia' calcolate: pickup(window) = OTB_oggi - OTB_(oggi-window) per notte.
    // Questo e' il "Pickup report giornaliero" classico di un RMS: mostra DOVE
    // (su quali date) si sta concentrando la domanda recente.
    const pickupByDate: Array<{
      date: string
      roomsOtb: number
      revenueOtb: number
      pickup1Rooms: number
      pickup3Rooms: number
      pickup7Rooms: number
      pickup7Revenue: number
    }> = []
    const cell = (m: Map<string, OtbCell>, d: string): OtbCell => m.get(d) ?? { rooms: 0, revenue: 0 }
    for (const [night, today_] of otbToday) {
      const r1 = today_.rooms - cell(otb1, night).rooms
      const r3 = today_.rooms - cell(otb3, night).rooms
      const r7 = today_.rooms - cell(otb7, night).rooms
      const rev7 = today_.revenue - cell(otb7, night).revenue
      // includi solo le notti con un movimento recente (pickup o disdetta a 7gg)
      if (r1 === 0 && r3 === 0 && r7 === 0) continue
      pickupByDate.push({
        date: night,
        roomsOtb: today_.rooms,
        revenueOtb: Math.round(today_.revenue),
        pickup1Rooms: r1,
        pickup3Rooms: r3,
        pickup7Rooms: r7,
        pickup7Revenue: Math.round(rev7),
      })
    }
    pickupByDate.sort((a, b) => (a.date < b.date ? -1 : 1))

    // --- breakdown per mese ---
    const months = new Map<
      string,
      { rooms: number; revenue: number; stlyRooms: number; stlyRevenue: number }
    >()
    const monthOf = (iso: string) => iso.slice(0, 7)
    for (const [night, cell] of otbToday) {
      const m = months.get(monthOf(night)) ?? { rooms: 0, revenue: 0, stlyRooms: 0, stlyRevenue: 0 }
      m.rooms += cell.rooms
      m.revenue += cell.revenue
      months.set(monthOf(night), m)
    }
    for (const [night, cell] of otbStly) {
      // riporta la notte LY al mese CY corrispondente
      const cyNight = addDays(night, STLY_OFFSET)
      const m = months.get(monthOf(cyNight)) ?? { rooms: 0, revenue: 0, stlyRooms: 0, stlyRevenue: 0 }
      m.stlyRooms += cell.rooms
      m.stlyRevenue += cell.revenue
      months.set(monthOf(cyNight), m)
    }
    const byMonth = [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        rooms: v.rooms,
        revenue: Math.round(v.revenue),
        adr: v.rooms > 0 ? Math.round(v.revenue / v.rooms) : 0,
        stlyRooms: v.stlyRooms,
        stlyRevenue: Math.round(v.stlyRevenue),
        stlyAdr: v.stlyRooms > 0 ? Math.round(v.stlyRevenue / v.stlyRooms) : 0,
        roomsVarPct: pct(v.rooms, v.stlyRooms),
        revenueVarPct: pct(v.revenue, v.stlyRevenue),
      }))

    // --- curva di prenotazione (CY vs LY) a step settimanali a ritroso ---
    // Include sia camere sia ricavo, cosi' la UI puo' alternare le due metriche
    // (camere in calo ma ricavo in crescita = stessa storia ADR piu' alto).
    const curve: Array<{
      daysBefore: number
      cyRooms: number
      lyRooms: number
      cyRevenue: number
      lyRevenue: number
    }> = []
    for (let k = CURVE_WEEKS; k >= 0; k--) {
      const daysBefore = k * 7
      const cyAsOf = addDays(today, -daysBefore)
      const lyAsOf = addDays(today, -STLY_OFFSET - daysBefore)
      const cy = sumOtb(computeOtb(cyBookings, cyAsOf, from, addDays(to, 1)))
      const ly = sumOtb(computeOtb(lyBookings, lyAsOf, lyFrom, addDays(lyTo, 1)))
      curve.push({
        daysBefore,
        cyRooms: cy.rooms,
        lyRooms: ly.rooms,
        cyRevenue: Math.round(cy.revenue),
        lyRevenue: Math.round(ly.revenue),
      })
    }

    // --- DEMAND FORECAST (occupazione futura attesa) ---
    // Metodo "booking curve / pickup ratio": dalla curva LY ricaviamo, per ogni
    // lead time, la frazione dell'OTB finale gia' materializzata. Proiettiamo
    // l'OTB attuale di ogni notte fino all'arrivo dividendo per quella frazione,
    // con cap sulla capacita' reale (daily_availability). E' una stima, non una
    // certezza: serve a capire dove ci si aspetta di riempire o restare scoperti.
    //
    // fractionAtLead(L) = roomsLY(L) / roomsLY(0)  (0 = giorno di arrivo = finale)
    const lyFinalRooms = curve.find((c) => c.daysBefore === 0)?.lyRooms ?? 0
    // mappa daysBefore -> rooms LY (per interpolazione)
    const lyCurve = curve.map((c) => ({ d: c.daysBefore, rooms: c.lyRooms })).sort((a, b) => a.d - b.d)
    const fractionAtLead = (lead: number): number => {
      if (lyFinalRooms <= 0) return 1
      const L = Math.max(0, lead)
      // trova i due punti che racchiudono L e interpola linearmente
      let lo = lyCurve[0]
      let hi = lyCurve[lyCurve.length - 1]
      if (L <= lo.d) return clampFrac(lo.rooms / lyFinalRooms)
      if (L >= hi.d) return clampFrac(hi.rooms / lyFinalRooms)
      for (let i = 0; i < lyCurve.length - 1; i++) {
        if (L >= lyCurve[i].d && L <= lyCurve[i + 1].d) {
          lo = lyCurve[i]
          hi = lyCurve[i + 1]
          break
        }
      }
      const span = hi.d - lo.d
      const t = span > 0 ? (L - lo.d) / span : 0
      const rooms = lo.rooms + (hi.rooms - lo.rooms) * t
      return clampFrac(rooms / lyFinalRooms)
    }

    // capacita' per notte da daily_availability (somma sui room type).
    // NB: usare total_rooms - out_of_service = capacita' VENDIBILE TOTALE, non
    // rooms_available (che e' la disponibilita' RESIDUA, cala man mano che si
    // vende -> userebbe un denominatore sbagliato e occupancy > 100%).
    const { data: availRows } = await supabase
      .from("daily_availability")
      .select("date,total_rooms,rooms_out_of_service")
      .eq("hotel_id", hotelId)
      .gte("date", from)
      .lte("date", to)
    const capByDate = new Map<string, number>()
    for (const r of availRows ?? []) {
      const cap = Math.max(0, (r.total_rooms ?? 0) - (r.rooms_out_of_service ?? 0))
      capByDate.set(r.date, (capByDate.get(r.date) ?? 0) + cap)
    }

    const forecastByDate: Array<{
      date: string
      capacity: number | null
      otbRooms: number
      otbOccupancy: number | null
      forecastRooms: number
      forecastOccupancy: number | null
      forecastRevenue: number
    }> = []
    let fcRoomsTot = 0
    let fcRevenueTot = 0
    let capTot = 0
    let otbRoomsTot = 0
    for (const [night, cellNow] of otbToday) {
      const lead = daysBetween(today, night)
      const frac = fractionAtLead(lead)
      const cap = capByDate.has(night) ? capByDate.get(night)! : null
      const otb = cellNow.rooms
      const adr = otb > 0 ? cellNow.revenue / otb : 0
      // proiezione moltiplicativa; se non c'e' segnale (otb=0) resta 0
      let fcRooms = frac > 0 ? Math.round(otb / frac) : otb
      if (cap != null) fcRooms = Math.min(fcRooms, cap)
      fcRooms = Math.max(fcRooms, otb) // non puo' scendere sotto l'on-the-books
      const fcRevenue = Math.round(fcRooms * adr)
      forecastByDate.push({
        date: night,
        capacity: cap,
        otbRooms: otb,
        otbOccupancy: cap && cap > 0 ? Math.round((otb / cap) * 100) : null,
        forecastRooms: fcRooms,
        forecastOccupancy: cap && cap > 0 ? Math.round((fcRooms / cap) * 100) : null,
        forecastRevenue: fcRevenue,
      })
      fcRoomsTot += fcRooms
      fcRevenueTot += fcRevenue
      otbRoomsTot += otb
      if (cap != null) capTot += cap
    }
    forecastByDate.sort((a, b) => (a.date < b.date ? -1 : 1))

    const forecast = {
      method: "booking-curve-stly" as const,
      rooms: fcRoomsTot,
      revenue: fcRevenueTot,
      otbRooms: otbRoomsTot,
      capacity: capTot > 0 ? capTot : null,
      occupancy: capTot > 0 ? Math.round((fcRoomsTot / capTot) * 100) : null,
      otbOccupancy: capTot > 0 ? Math.round((otbRoomsTot / capTot) * 100) : null,
      byDate: forecastByDate,
    }

    // --- ANALIZZATORE & ANOMALIE (diagnosi, non pricing) ---
    // Riusa le mappe OTB gia' calcolate. La TRAIETTORIA confronta il gap vs STLY
    // di LOOKBACK giorni fa (CY = otb14 gia' calcolato; STLY-allora ricostruito
    // in-memory da lyBookings allo stesso anticipo) con quello di oggi.
    const LOOKBACK = DEFAULT_ANALYZER_CONFIG.trajectoryLookbackDays // 14
    const otbStlyThen = computeOtb(lyBookings, addDays(today, -STLY_OFFSET - LOOKBACK), lyFrom, addDays(lyTo, 1))

    const monthOfIso = (iso: string) => iso.slice(0, 7)
    const sumRoomsRevByMonth = (
      map: Map<string, OtbCell>,
      shiftToCy: boolean,
    ): Map<string, { rooms: number; revenue: number }> => {
      const out = new Map<string, { rooms: number; revenue: number }>()
      for (const [night, c] of map) {
        const key = monthOfIso(shiftToCy ? addDays(night, STLY_OFFSET) : night)
        const agg = out.get(key) ?? { rooms: 0, revenue: 0 }
        agg.rooms += c.rooms
        agg.revenue += c.revenue
        out.set(key, agg)
      }
      return out
    }
    // CY "allora" (oggi-14) e STLY "allora" (oggi-364-14), aggregati per mese CY.
    const cyThenByMonth = sumRoomsRevByMonth(otb14, false)
    const stlyThenByMonth = sumRoomsRevByMonth(otbStlyThen, true)
    // CY a 7 giorni fa per il pickup mensile.
    const cy7ByMonth = sumRoomsRevByMonth(otb7, false)
    const cyNowByMonth = sumRoomsRevByMonth(otbToday, false)

    // Occupazione e lead time minimo per mese dal forecast per-data.
    const occByMonth = new Map<string, { otbRooms: number; fcRooms: number; cap: number; minLead: number }>()
    for (const d of forecastByDate) {
      if (d.capacity == null) continue
      const key = monthOfIso(d.date)
      const o = occByMonth.get(key) ?? { otbRooms: 0, fcRooms: 0, cap: 0, minLead: Number.POSITIVE_INFINITY }
      o.otbRooms += d.otbRooms
      o.fcRooms += d.forecastRooms
      o.cap += d.capacity
      o.minLead = Math.min(o.minLead, daysBetween(today, d.date))
      occByMonth.set(key, o)
    }

    const analyzerInput: AnalyzerMonthInput[] = byMonth.map((mm) => {
      const occ = occByMonth.get(mm.month)
      const cyThen = cyThenByMonth.get(mm.month)
      const stlyThen = stlyThenByMonth.get(mm.month)
      const cy7 = cy7ByMonth.get(mm.month)
      const cyNow = cyNowByMonth.get(mm.month)
      return {
        month: mm.month,
        rooms: mm.rooms,
        revenue: mm.revenue,
        adr: mm.adr,
        stlyRooms: mm.stlyRooms,
        stlyRevenue: mm.stlyRevenue,
        stlyAdr: mm.stlyAdr,
        thenRevenue: cyThen ? Math.round(cyThen.revenue) : null,
        thenStlyRevenue: stlyThen ? Math.round(stlyThen.revenue) : null,
        otbOccupancyPct: occ && occ.cap > 0 ? Math.round((occ.otbRooms / occ.cap) * 100) : null,
        forecastOccupancyPct: occ && occ.cap > 0 ? Math.round((occ.fcRooms / occ.cap) * 100) : null,
        pickup7Rooms: cyNow && cy7 ? cyNow.rooms - cy7.rooms : 0,
        pickup14Rooms: cyNow && cyThen ? cyNow.rooms - cyThen.rooms : 0,
        minLeadDays: occ && Number.isFinite(occ.minLead) ? occ.minLead : daysBetween(today, `${mm.month}-01`),
      }
    })
    const analyzer = analyzePace(analyzerInput)

    // --- SEGMENTAZIONE PER CANALE ---
    // Mix dei canali sull'on-the-books del periodo selezionato: per ogni macro
    // categoria calcola camere-notte, ricavo lordo, ADR, commissioni stimate e
    // RICAVO NETTO (cio' che resta dopo le OTA). Confronto vs STLY a parita' di
    // anticipo per leggere se il diretto sta guadagnando o perdendo quota.
    const chBookings = await fetchAllPaginatedOrLog<ChannelBooking>(
      () =>
        supabase
          .from("bookings")
          .select(
            "booking_date, check_in_date, check_out_date, is_cancelled, number_of_rooms, number_of_nights, total_price, net_price, extras_revenue, channel, is_direct, commission_amount, commission_rate",
          )
          .eq("hotel_id", hotelId)
          .lt("check_in_date", addDays(to, 1))
          .gt("check_out_date", from)
          .order("check_in_date", { ascending: true }),
      "pace-channel-bookings",
    )

    // Commissioni per-canale configurate per la struttura (override dei default).
    // Per ogni slug: la % effettiva e se proviene da una config esplicita.
    const { data: commRows } = await supabase
      .from("pace_channel_commissions")
      .select("category, commission_pct")
      .eq("hotel_id", hotelId)
    const configuredPct = new Map<ChannelCategorySlug, number>(
      (commRows ?? []).map((r) => [r.category as ChannelCategorySlug, Number(r.commission_pct)]),
    )
    // Risolve la % di commissione per una categoria: usa il valore configurato
    // se presente, altrimenti il default. Ritorna anche se era configurato (per
    // decidere se mostrare la nota "stima" in UI).
    const resolveCommissionPct = (cat: ChannelCategory): { pct: number; configured: boolean } => {
      const slug = CATEGORY_TO_SLUG[cat]
      if (configuredPct.has(slug)) return { pct: configuredPct.get(slug)!, configured: true }
      return { pct: DEFAULT_COMMISSION_PCT_BY_SLUG[slug], configured: false }
    }

    type ChannelAgg = {
      rooms: number
      revenue: number
      commission: number
      bookings: number
    }
    const emptyAgg = (): ChannelAgg => ({ rooms: 0, revenue: 0, commission: 0, bookings: 0 })
    const aggCy = new Map<ChannelCategory, ChannelAgg>()
    const aggStly = new Map<ChannelCategory, ChannelAgg>()
    let commissionIsEstimated = false

    const overlapNights = (ci: string, co: string, winFrom: string, winTo: string): number => {
      const s = ci < winFrom ? winFrom : ci
      const e = co > winTo ? winTo : co
      return Math.max(0, daysBetween(s, e))
    }

    for (const b of chBookings) {
      if (b.is_cancelled || !b.booking_date || b.booking_date > today) continue
      if (!b.check_in_date || !b.check_out_date) continue
      const nights = overlapNights(b.check_in_date, b.check_out_date, from, addDays(to, 1))
      if (nights <= 0) continue
      const roomsPerNight = b.number_of_rooms && b.number_of_rooms > 0 ? b.number_of_rooms : 1
      const roomNights = nights * roomsPerNight
      const totalNights = b.number_of_nights && b.number_of_nights > 0 ? b.number_of_nights : 1
      const roomTotal =
        b.net_price != null
          ? Number(b.net_price)
          : b.total_price != null
            ? Number(b.total_price) - Number(b.extras_revenue ?? 0)
            : 0
      const revPerNight = totalNights > 0 ? roomTotal / totalNights : roomTotal
      const revenue = Math.max(0, revPerNight * roomsPerNight * nights)
      const cat = categorizeChannel(b.channel, b.is_direct)
      // commissione: usa il dato reale del PMS se presente, altrimenti applica
      // la % configurata per la struttura o, in mancanza, il default di mercato
      // (segnalando che e' una stima per la nota in UI).
      let commission = 0
      if (b.commission_amount != null && Number(b.commission_amount) > 0) {
        // commission_amount e' sull'intera prenotazione: proporziona alle notti in finestra
        const totalRoomNights = totalNights * roomsPerNight
        commission = totalRoomNights > 0 ? (Number(b.commission_amount) * roomNights) / totalRoomNights : 0
      } else if (b.commission_rate != null && Number(b.commission_rate) > 0) {
        commission = revenue * (Number(b.commission_rate) / 100)
      } else {
        const { pct, configured } = resolveCommissionPct(cat)
        commission = revenue * (pct / 100)
        // "stima" solo quando applichiamo un DEFAULT non configurato e diverso da 0
        if (commission > 0 && !configured) commissionIsEstimated = true
      }
      const agg = aggCy.get(cat) ?? emptyAgg()
      agg.rooms += roomNights
      agg.revenue += revenue
      agg.commission += commission
      agg.bookings += 1
      aggCy.set(cat, agg)
    }

    // STLY: stesse prenotazioni dell'anno scorso, on-the-books allo stesso
    // anticipo. Query dedicata perche' lyBookings (fetchPaceBookings) NON
    // include i campi canale -> altrimenti tutto cadrebbe in "Diretto".
    const chBookingsLy = await fetchAllPaginatedOrLog<ChannelBooking>(
      () =>
        supabase
          .from("bookings")
          .select(
            "booking_date, check_in_date, check_out_date, is_cancelled, number_of_rooms, number_of_nights, total_price, net_price, extras_revenue, channel, is_direct, commission_amount, commission_rate",
          )
          .eq("hotel_id", hotelId)
          .lt("check_in_date", addDays(lyTo, 1))
          .gt("check_out_date", lyFrom)
          .order("check_in_date", { ascending: true }),
      "pace-channel-bookings-ly",
    )
    for (const b of chBookingsLy) {
      if (b.is_cancelled || !b.booking_date || b.booking_date > addDays(today, -STLY_OFFSET)) continue
      if (!b.check_in_date || !b.check_out_date) continue
      const nights = overlapNights(b.check_in_date, b.check_out_date, lyFrom, addDays(lyTo, 1))
      if (nights <= 0) continue
      const roomsPerNight = b.number_of_rooms && b.number_of_rooms > 0 ? b.number_of_rooms : 1
      const totalNights = b.number_of_nights && b.number_of_nights > 0 ? b.number_of_nights : 1
      const roomTotal =
        b.net_price != null
          ? Number(b.net_price)
          : b.total_price != null
            ? Number(b.total_price) - Number(b.extras_revenue ?? 0)
            : 0
      const revenue = Math.max(0, (totalNights > 0 ? roomTotal / totalNights : roomTotal) * roomsPerNight * nights)
      const cat = categorizeChannel(b.channel ?? null, b.is_direct ?? null)
      const agg = aggStly.get(cat) ?? emptyAgg()
      agg.rooms += nights * roomsPerNight
      agg.revenue += revenue
      aggStly.set(cat, agg)
    }

    const chTotRevenue = [...aggCy.values()].reduce((s, a) => s + a.revenue, 0)
    const chTotRooms = [...aggCy.values()].reduce((s, a) => s + a.rooms, 0)
    const chTotCommission = [...aggCy.values()].reduce((s, a) => s + a.commission, 0)
    const stlyTotRevenue = [...aggStly.values()].reduce((s, a) => s + a.revenue, 0)
    const catOrder: ChannelCategory[] = ["Diretto", "OTA", "Tour Operator / Agenzie", "Altro"]
    const channels = catOrder
      .filter((cat) => aggCy.has(cat))
      .map((cat) => {
        const a = aggCy.get(cat)!
        const stly = aggStly.get(cat)
        const stlyShare = stlyTotRevenue > 0 && stly ? stly.revenue / stlyTotRevenue : null
        const share = chTotRevenue > 0 ? a.revenue / chTotRevenue : 0
        return {
          category: cat,
          bookings: a.bookings,
          rooms: a.rooms,
          revenue: Math.round(a.revenue),
          netRevenue: Math.round(a.revenue - a.commission),
          commission: Math.round(a.commission),
          adr: a.rooms > 0 ? Math.round(a.revenue / a.rooms) : 0,
          revenueShare: share,
          stlyRevenueShare: stlyShare,
          shareDeltaPts: stlyShare != null ? (share - stlyShare) * 100 : null,
        }
      })

    const channelMix = {
      totalRooms: chTotRooms,
      totalRevenue: Math.round(chTotRevenue),
      totalNetRevenue: Math.round(chTotRevenue - chTotCommission),
      totalCommission: Math.round(chTotCommission),
      directShare: chTotRevenue > 0 ? (aggCy.get("Diretto")?.revenue ?? 0) / chTotRevenue : 0,
      commissionIsEstimated,
      channels,
    }

    // Visualizzazione IVA tenant. Pace è interamente room-based (booking-derived)
    // e usa commissioni STIMATE (non fatturate): lo scorporo lineare con
    // l'aliquota alloggio mantiene coerenti share, % varianza e ADR (rapporti
    // invarianti). Scaliamo tutti i campi monetari noti, incluse commissioni e
    // netRevenue stimati. Conteggi camere / occupancy NON toccati.
    const vatCfg = resolveVatConfig(await getHotelVatConfig(supabase, hotelId), parseVatViewParam(searchParams))
    const payload = scorporoMonetaryDeep(
      {
        range: { from, to, today, leadDays: daysBetween(today, from) },
        forecast,
        channelMix,
        current: {
          rooms: curTot.rooms,
          revenue: Math.round(curTot.revenue),
          adr: curTot.rooms > 0 ? Math.round(curTot.revenue / curTot.rooms) : 0,
        },
        stly: {
          rooms: stlyTot.rooms,
          revenue: Math.round(stlyTot.revenue),
          adr: stlyTot.rooms > 0 ? Math.round(stlyTot.revenue / stlyTot.rooms) : 0,
        },
        variance: {
          roomsPct: pct(curTot.rooms, stlyTot.rooms),
          revenuePct: pct(curTot.revenue, stlyTot.revenue),
        },
        pickup: {
          last1: { rooms: curTot.rooms - tot1.rooms, revenue: Math.round(curTot.revenue - tot1.revenue) },
          last3: { rooms: curTot.rooms - tot3.rooms, revenue: Math.round(curTot.revenue - tot3.revenue) },
          last7: { rooms: curTot.rooms - tot7.rooms, revenue: Math.round(curTot.revenue - tot7.revenue) },
          last14: { rooms: curTot.rooms - tot14.rooms, revenue: Math.round(curTot.revenue - tot14.revenue) },
          last30: { rooms: curTot.rooms - tot30.rooms, revenue: Math.round(curTot.revenue - tot30.revenue) },
        },
        pickupByDate,
        byMonth,
        curve,
        analyzer,
      },
      [
        "revenue",
        "revenueOtb",
        "pickup7Revenue",
        "forecastRevenue",
        "stlyRevenue",
        "cyRevenue",
        "lyRevenue",
        "netRevenue",
        "commission",
        "totalRevenue",
        "totalNetRevenue",
        "totalCommission",
        // campi monetari dell'analizzatore (le % restano invarianti)
        "adr",
        "stlyAdr",
        "totalDelta",
        "volumeEffect",
        "priceEffect",
      ],
      vatCfg,
    )
    return NextResponse.json({
      ...payload,
      vatMode: vatCfg.mode,
      accommodationVatRate: vatCfg.accommodationRate,
    })
  } catch (error) {
    console.error("[accelerator/pace] error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
