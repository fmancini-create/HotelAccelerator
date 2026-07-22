/**
 * AI Report — Aggregazione deterministica
 *
 * Calcola un summary numerico delle prenotazioni di un hotel su un range di
 * date, da passare al modello AI come unica fonte di verita' (zero raw data
 * verso il modello: solo numeri aggregati ~3-5 KB di JSON).
 *
 * SOURCE OF TRUTH (allineato a /dati/objectives):
 *   - Hotel in modalita' API (Scidoo): leggiamo `scidoo_raw_bookings` e
 *     ricaviamo channel/rate/country/cancellation/daily_price da `raw_data`.
 *     Il revenue per notte viene da `raw_data.statics[]` filtrato per
 *     category === "Pernotto" (con fallback a `raw_data.daily_price`).
 *   - Hotel in modalita' non-API (gsheets/Bedzzle): leggiamo `bookings` e
 *     ricostruiamo i daily_price come fa objectives (room-only = total_price
 *     - extras, ripartito per notte).
 *
 * Filtro `dateMode`:
 *   - "booking": booking_date ∈ [from, to] — risponde a "cosa abbiamo
 *     venduto in questo periodo" (anche per soggiorni futuri).
 *   - "stay": le notti di soggiorno ∈ [from, to] — risponde a "come e'
 *     andato il fatturato in questo periodo".
 *
 * BUG FIX 30/04/2026: la versione precedente leggeva `bookings.daily_price`
 * che NON esiste come colonna (Postgres errore), il loop faceva break silently
 * e l'aggregazione tornava sempre a zero. Ora replica fedelmente il fetch di
 * objectives/route.ts e legge dai source corretti.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type DateMode = "booking" | "stay"

export interface AggregateInput {
  supabase: SupabaseClient
  hotelId: string
  from: string // YYYY-MM-DD inclusive
  to: string // YYYY-MM-DD inclusive
  dateMode: DateMode
}

export interface AggregateSummary {
  // Range echo + meta
  range: { from: string; to: string; days: number; dateMode: DateMode }
  source: "scidoo" | "non-api"

  // Volumi base
  bookingsCount: number
  cancellationsCount: number
  cancelRatePct: number
  roomNights: number
  guestNightsApprox: number

  // Revenue
  revenueTotal: number
  adr: number
  revpor: number

  // Soggiorno
  losAvgDays: number
  losP50: number

  // Pickup / lead time
  leadTimeAvgDays: number | null
  leadTimeP25: number | null
  leadTimeP50: number | null
  leadTimeP75: number | null

  // Distribuzioni
  channelMix: DistRow[]
  rateMix: DistRow[]
  marketMix: DistRow[]
  pickupBuckets: PickupBucket[]

  // Cancellazioni
  cancellationLeadAvgDays: number | null
  cancellationsByChannel: DistRow[]
}

export interface DistRow {
  key: string
  bookings: number
  nights: number
  revenue: number
  sharePct: number
}

export interface PickupBucket {
  bucket: string
  bookings: number
  nights: number
  revenue: number
  sharePct: number
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return sorted[base + 1] != null ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base]
}

function bucketLeadTime(days: number | null): string {
  if (days == null || days < 0) return "sconosciuto"
  if (days <= 7) return "0-7gg"
  if (days <= 30) return "8-30gg"
  if (days <= 60) return "31-60gg"
  if (days <= 180) return "61-180gg"
  return "180+gg"
}

const PICKUP_BUCKET_ORDER = ["0-7gg", "8-30gg", "31-60gg", "61-180gg", "180+gg", "sconosciuto"]

function topN<T extends { nights: number }>(rows: T[], n: number): T[] {
  return [...rows].sort((a, b) => b.nights - a.nights).slice(0, n)
}

// Scidoo status di "vendita confermata" (DEFAULT_PRODUCTION_STATUSES da
// /api/dati/objectives — match con il "Booking Manager x mese" di Scidoo).
const SCIDOO_ACTIVE_STATUSES = new Set([
  "opzione",
  "attesa_pagamento",
  "confermata",
  "confermata_manuale",
  "confermata_pagamento",
  "confermata_carta",
  "check_in",
  "saldo",
  "check_out",
])

// ──────────────────────────────────────────────────────────────────────────
// Estrazione notti+revenue da una booking unificata
// ──────────────────────────────────────────────────────────────────────────

interface UnifiedBooking {
  id: string
  bookingDate: string | null
  checkInDate: string | null
  checkOutDate: string | null
  isCancelled: boolean
  cancellationDate: string | null
  channel: string
  rateKey: string
  market: string
  numberOfGuests: number
  // Notti gia' calcolate per questa prenotazione (data + prezzo + lineIdx)
  nights: { date: string; price: number; lineIdx: number }[]
}

// ──────────────────────────────────────────────────────────────────────────
// Fetch Scidoo (modalita' API)
// ──────────────────────────────────────────────────────────────────────────

interface ScidooRawRow {
  id: string
  checkin_date: string | null
  checkout_date: string | null
  booking_date: string | null
  status: string | null
  raw_data: Record<string, unknown> | null
}

async function fetchScidooBookings(
  supabase: SupabaseClient,
  hotelId: string,
  stayLooseFrom: string,
  stayLooseTo: string,
): Promise<ScidooRawRow[]> {
  const PAGE = 1000
  let all: ScidooRawRow[] = []
  let pageStart = 0
  // Loop con paginazione esplicita per evitare il truncate silenzioso 1000.
  while (true) {
    const { data, error } = await supabase
      .from("scidoo_raw_bookings")
      .select("id, checkin_date, checkout_date, booking_date, status, raw_data")
      .eq("hotel_id", hotelId)
      .lte("checkin_date", stayLooseTo)
      .gte("checkout_date", stayLooseFrom)
      .range(pageStart, pageStart + PAGE - 1)
    if (error) {
      // Throw esplicito invece di break: cosi' l'utente vede l'errore reale
      // invece di un report con tutti zeri.
      throw new Error(`scidoo_raw_bookings fetch failed: ${error.message}`)
    }
    if (!data || data.length === 0) break
    all = all.concat(data as ScidooRawRow[])
    if (data.length < PAGE) break
    pageStart += PAGE
  }
  return all
}

function unifyScidoo(row: ScidooRawRow): UnifiedBooking | null {
  const raw = (row.raw_data || {}) as Record<string, unknown>

  // Skip "Testata" di gruppo (raggruppamenti, non camere reali)
  const type = String((raw.type as string) || "")
  if (type.toLowerCase().includes("testata")) return null

  const status = String(row.status || "").toLowerCase()
  const isCancelled = status === "annullata" || status === "cancelled"

  // For non-cancelled bookings: deve essere uno status di "vendita reale"
  // (allineato al filtro DEFAULT_PRODUCTION_STATUSES di objectives) E avere
  // almeno una notte (statics Pernotto o daily_price). Le cancellazioni
  // passano sempre (le contiamo a parte).
  if (!isCancelled && !SCIDOO_ACTIVE_STATUSES.has(status)) {
    // Status non riconosciuto (es. "preventivo"): scartiamo per evitare
    // doppio conteggio con stati simili.
    return null
  }

  // Notti + prezzo: source preferenziale = statics Pernotto, fallback = daily_price
  const nights: { date: string; price: number; lineIdx: number }[] = []
  const statics = Array.isArray(raw.statics) ? (raw.statics as Array<Record<string, unknown>>) : []
  const pernottoRows = statics.filter((s) => String(s.category) === "Pernotto")
  if (pernottoRows.length > 0) {
    let i = 0
    for (const s of pernottoRows) {
      const dt = s.date_time ? String(s.date_time).slice(0, 10) : null
      const price = Number(s.price) || 0
      if (dt && price >= 0) {
        nights.push({ date: dt, price, lineIdx: i })
        i++
      }
    }
  }
  if (nights.length === 0) {
    const dp = raw.daily_price as Record<string, unknown> | undefined
    if (dp && typeof dp === "object" && !Array.isArray(dp)) {
      let i = 0
      for (const [date, priceRaw] of Object.entries(dp)) {
        const price = Number(priceRaw) || 0
        nights.push({ date, price, lineIdx: i })
        i++
      }
    }
  }

  // Per i NON cancellati: niente notti = booking ausiliario ("Senza Soggiorno"),
  // lo scartiamo.
  if (!isCancelled && nights.length === 0) return null

  // Cancellation date dal raw o fallback alla colonna
  const cancellationRaw = raw.cancellation ? String(raw.cancellation) : null
  const cancellationDate = cancellationRaw ? cancellationRaw.split(" ")[0] : null

  // Channel: raw.agency.name oppure raw.origin oppure "Diretto"
  const agency = (raw.agency as Record<string, unknown> | undefined) || {}
  const agencyName = agency.name ? String(agency.name).trim() : ""
  const origin = raw.origin ? String(raw.origin).trim() : ""
  let channel = agencyName || origin || "Diretto"
  // Normalizza alcuni alias comuni
  const chLower = channel.toLowerCase()
  if (chLower.includes("direct") || chLower.includes("diretto") || chLower.includes("sito")) {
    channel = "Diretto"
  }

  // Tariffa (rate_name dal raw)
  const rateName = raw.rate_name ? String(raw.rate_name).trim() : ""
  const rateCode = raw.rate_id != null ? String(raw.rate_id) : ""
  const rateKey = rateName || rateCode || "Senza tariffa"

  // Mercato: customer.citizenship (codice ISO o nome paese)
  const customer = (raw.customer as Record<string, unknown> | undefined) || {}
  const market = customer.citizenship ? String(customer.citizenship).trim() : "Sconosciuto"

  const numberOfGuests = Number(raw.guest_count) || 1

  return {
    id: row.id,
    bookingDate: row.booking_date,
    checkInDate: row.checkin_date,
    checkOutDate: row.checkout_date,
    isCancelled,
    cancellationDate,
    channel,
    rateKey,
    market: market || "Sconosciuto",
    numberOfGuests,
    nights,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Fetch non-API (bookings table)
// ──────────────────────────────────────────────────────────────────────────

interface BookingsRow {
  id: string
  channel: string | null
  rate_id: string | null
  rate_name: string | null
  rate_code: string | null
  guest_country: string | null
  check_in_date: string | null
  check_out_date: string | null
  booking_date: string | null
  is_cancelled: boolean | null
  cancellation_date: string | null
  booking_pickup_days: number | null
  total_price: number | null
  price_per_night: number | null
  number_of_nights: number | null
  number_of_guests: number | null
  extras_revenue: number | null
  fb_revenue: number | null
  spa_revenue: number | null
  other_revenue: number | null
}

async function fetchBookings(
  supabase: SupabaseClient,
  hotelId: string,
  stayLooseFrom: string,
  stayLooseTo: string,
): Promise<BookingsRow[]> {
  const PAGE = 1000
  let all: BookingsRow[] = []
  let pageStart = 0
  while (true) {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, channel, rate_id, rate_name, rate_code, guest_country, check_in_date, check_out_date, booking_date, is_cancelled, cancellation_date, booking_pickup_days, total_price, price_per_night, number_of_nights, number_of_guests, extras_revenue, fb_revenue, spa_revenue, other_revenue",
      )
      .eq("hotel_id", hotelId)
      .lte("check_in_date", stayLooseTo)
      .gte("check_out_date", stayLooseFrom)
      .range(pageStart, pageStart + PAGE - 1)
    if (error) {
      throw new Error(`bookings fetch failed: ${error.message}`)
    }
    if (!data || data.length === 0) break
    all = all.concat(data as BookingsRow[])
    if (data.length < PAGE) break
    pageStart += PAGE
  }
  return all
}

function unifyBooking(row: BookingsRow): UnifiedBooking | null {
  const isCancelled = row.is_cancelled === true

  // Notti + revenue: stesso pattern di objectives (room-only nightly = (total - extras) / nights)
  const nights: { date: string; price: number; lineIdx: number }[] = []
  if (!isCancelled && row.check_in_date && row.check_out_date) {
    const numNights = Number(row.number_of_nights) || 0
    const totalPrice = Number(row.total_price) || 0
    const extras =
      (Number(row.extras_revenue) || 0) +
      (Number(row.fb_revenue) || 0) +
      (Number(row.spa_revenue) || 0) +
      (Number(row.other_revenue) || 0)
    const roomOnly = Math.max(0, totalPrice - extras)
    const nightly = numNights > 0 ? roomOnly / numNights : Number(row.price_per_night) || 0
    if (nightly > 0) {
      const ci = new Date(row.check_in_date)
      const co = new Date(row.check_out_date)
      let i = 0
      for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
        nights.push({ date: d.toISOString().slice(0, 10), price: nightly, lineIdx: i })
        i++
      }
    }
  }

  if (!isCancelled && nights.length === 0) return null

  return {
    id: row.id,
    bookingDate: row.booking_date,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    isCancelled,
    cancellationDate: row.cancellation_date,
    channel: (row.channel || "Diretto").trim() || "Diretto",
    rateKey: (row.rate_name || row.rate_code || "Senza tariffa").trim() || "Senza tariffa",
    market: (row.guest_country || "Sconosciuto").trim() || "Sconosciuto",
    numberOfGuests: Number(row.number_of_guests) || 1,
    nights,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry
// ──────────────────────────────────────────────────────────────────────────

export async function aggregateBookingsForRange(input: AggregateInput): Promise<AggregateSummary> {
  const { supabase, hotelId, from, to, dateMode } = input

  // 1. Determina la modalita' del PMS dell'hotel
  const { data: pmsConfig, error: pmsErr } = await supabase
    .from("pms_integrations")
    .select("integration_mode, pms_name")
    .eq("hotel_id", hotelId)
    .maybeSingle()
  if (pmsErr) {
    console.error("[ai-report] pms_integrations error:", pmsErr.message)
  }
  // Determina la SORGENTE dei dati (non la modalita' di integrazione):
  //  - "scidoo" → leggiamo `scidoo_raw_bookings` (raw_data + statics[])
  //  - tutti gli altri (gsheets, bedzzle, brig, ...) → `public.bookings`
  // FIX 21/05/2026: prima usavamo `integration_mode === "api"` come proxy
  // di "Scidoo", ma BRiG e' un connector API che scrive in `public.bookings`
  // → con il vecchio check il report partiva su `fetchScidooBookings` e
  // tornava vuoto (Hotel Cavallino: 3075 bookings reali, report a zero).
  // Vedi memoria santaddeo-brig-etl-incident-21-05.
  const pmsNameLower = String(pmsConfig?.pms_name || "").toLowerCase()
  const isScidooSource = pmsNameLower === "scidoo"
  const isApiMode = isScidooSource

  // 2-bis. Carico mappa `scidoo_rate_id -> name` per tradurre i codici
  // tariffa numerici nei nomi reali. Senza questa mappa il report AI
  // mostrava "tariffa 95734 / 256491" perche' raw_data.rate_name e'
  // sempre NULL su Barronci (e altri hotel Scidoo): il fallback a
  // raw_data.rate_id stampava il codice numerico. Dopo questa lookup
  // 95734 diventa "B&B Tariffe Web Miglior Prezzo Garantito" ecc.
  const rateNameById = new Map<string, string>()
  {
    const { data: ratesRows, error: ratesErr } = await supabase
      .from("rates")
      .select("scidoo_rate_id, name")
      .eq("hotel_id", hotelId)
    if (ratesErr) {
      console.error("[ai-report] rates lookup error:", ratesErr.message)
    } else if (ratesRows) {
      for (const r of ratesRows as Array<{ scidoo_rate_id: string | null; name: string | null }>) {
        if (r.scidoo_rate_id && r.name) rateNameById.set(String(r.scidoo_rate_id), r.name.trim())
      }
    }
  }

  /**
   * Normalizza una rateKey (potrebbe essere già un nome o un id numerico)
   * facendo lookup nella mappa rates. Se la stringa e' numerica e c'e'
   * match → ritorno il nome; altrimenti la lascio invariata.
   */
  function resolveRateName(key: string): string {
    if (!key) return "Senza tariffa"
    const trimmed = key.trim()
    if (!trimmed) return "Senza tariffa"
    // Se e' tutto cifre e abbiamo un mapping, sostituisco col nome
    if (/^\d+$/.test(trimmed)) {
      const name = rateNameById.get(trimmed)
      if (name) return name
      // Codice numerico senza match: meglio "Tariffa non mappata" che il numero
      return "Tariffa non mappata"
    }
    return trimmed
  }

  /**
   * Normalizza un channel: i canali Scidoo che restano numerici puri
   * (origin codes tipo 39711, 42476) sono agenzie senza nome esposto;
   * raggruppo tutti sotto "Altre agenzie" cosi il report non stampa
   * "39711: 5%, 42476: 3%, ..." (rumore inutile per il revenue manager).
   * Il valore "0" e' un edge che Scidoo emette quando origin manca: lo
   * raggruppo nello stesso bucket.
   */
  function normalizeChannel(ch: string): string {
    if (!ch) return "Diretto"
    const trimmed = ch.trim()
    if (!trimmed || trimmed === "0") return "Altre agenzie"
    if (/^\d+$/.test(trimmed)) return "Altre agenzie"
    return trimmed
  }

  // 2. Fetch superset largo: serve un cuscinetto per coprire bookings con
  //    booking_date nel range ma check-in fuori (es. prenotato oggi per
  //    Natale +8 mesi). Per i booking range fino a ~1 anno funziona; per
  //    range piu' lunghi si potrebbe ottimizzare ma e' raro.
  const looseFrom = new Date(from)
  looseFrom.setFullYear(looseFrom.getFullYear() - 1)
  const looseTo = new Date(to)
  looseTo.setFullYear(looseTo.getFullYear() + 1)
  const stayLooseFrom = looseFrom.toISOString().slice(0, 10)
  const stayLooseTo = looseTo.toISOString().slice(0, 10)

  const unified: UnifiedBooking[] = []
  if (isApiMode) {
    const rows = await fetchScidooBookings(supabase, hotelId, stayLooseFrom, stayLooseTo)
    for (const row of rows) {
      const u = unifyScidoo(row)
      if (u) unified.push(u)
    }
  } else {
    const rows = await fetchBookings(supabase, hotelId, stayLooseFrom, stayLooseTo)
    for (const row of rows) {
      const u = unifyBooking(row)
      if (u) unified.push(u)
    }
  }

  // Pass di normalizzazione: traduce i rateKey numerici nei nomi tariffa
  // e raggruppa i channel numerici sotto "Altre agenzie". Mutazione in-place
  // per evitare di duplicare l'array (decine di migliaia di booking).
  for (const u of unified) {
    u.rateKey = resolveRateName(u.rateKey)
    u.channel = normalizeChannel(u.channel)
  }

  // 3. Filtro per range + estrazione notti rilevanti
  function inRange(b: UnifiedBooking): { include: boolean; nightsInRange: { date: string; price: number; lineIdx: number }[] } {
    if (dateMode === "booking") {
      // Filtro su booking_date. Notti: TUTTE (rappresentano il "venduto" dalla prenotazione).
      const bd = b.bookingDate
      if (!bd) return { include: false, nightsInRange: [] }
      return { include: bd >= from && bd <= to, nightsInRange: b.nights }
    }
    // dateMode=stay: notti che cadono in [from, to]
    const filtered = b.nights.filter((n) => n.date >= from && n.date <= to)
    return { include: filtered.length > 0, nightsInRange: filtered }
  }

  function calcLeadDays(b: UnifiedBooking): number | null {
    if (!b.bookingDate || !b.checkInDate) return null
    const lead = Math.round(
      (new Date(b.checkInDate).getTime() - new Date(b.bookingDate).getTime()) / 86400000,
    )
    if (lead < 0 || lead > 1000) return null
    return lead
  }

  // 4. Aggrega
  let bookingsCount = 0
  let cancellationsCount = 0
  let revenueTotal = 0
  const roomNightsKeys = new Set<string>()
  let guestNightsApprox = 0
  const losDays: number[] = []
  const leadDays: number[] = []
  const cancelLeadDays: number[] = []
  const channelAcc = new Map<string, { bookings: number; nights: number; revenue: number }>()
  const rateAcc = new Map<string, { bookings: number; nights: number; revenue: number }>()
  const marketAcc = new Map<string, { bookings: number; nights: number; revenue: number }>()
  const pickupAcc = new Map<string, { bookings: number; nights: number; revenue: number }>()
  const cancelChannelAcc = new Map<string, { bookings: number; nights: number; revenue: number }>()

  for (const b of unified) {
    const { include, nightsInRange } = inRange(b)
    if (!include) continue

    if (b.isCancelled) {
      cancellationsCount++
      // Lead time tra prenotazione e cancellazione
      if (b.bookingDate && b.cancellationDate) {
        const lead = Math.round(
          (new Date(b.cancellationDate).getTime() - new Date(b.bookingDate).getTime()) / 86400000,
        )
        if (lead >= 0 && lead < 1000) cancelLeadDays.push(lead)
      }
      const cur = cancelChannelAcc.get(b.channel) || { bookings: 0, nights: 0, revenue: 0 }
      cur.bookings++
      cancelChannelAcc.set(b.channel, cur)
      continue
    }

    bookingsCount++
    const bookingNights = nightsInRange.length
    let bookingRevenue = 0
    for (const n of nightsInRange) {
      roomNightsKeys.add(`${n.date}|${b.id}|${n.lineIdx}`)
      bookingRevenue += n.price
    }
    revenueTotal += bookingRevenue
    guestNightsApprox += b.numberOfGuests * bookingNights

    if (bookingNights > 0) losDays.push(bookingNights)

    const lead = calcLeadDays(b)
    if (lead != null) leadDays.push(lead)
    const bucket = bucketLeadTime(lead)
    {
      const cur = pickupAcc.get(bucket) || { bookings: 0, nights: 0, revenue: 0 }
      cur.bookings++
      cur.nights += bookingNights
      cur.revenue += bookingRevenue
      pickupAcc.set(bucket, cur)
    }
    {
      const cur = channelAcc.get(b.channel) || { bookings: 0, nights: 0, revenue: 0 }
      cur.bookings++
      cur.nights += bookingNights
      cur.revenue += bookingRevenue
      channelAcc.set(b.channel, cur)
    }
    {
      const cur = rateAcc.get(b.rateKey) || { bookings: 0, nights: 0, revenue: 0 }
      cur.bookings++
      cur.nights += bookingNights
      cur.revenue += bookingRevenue
      rateAcc.set(b.rateKey, cur)
    }
    {
      const cur = marketAcc.get(b.market) || { bookings: 0, nights: 0, revenue: 0 }
      cur.bookings++
      cur.nights += bookingNights
      cur.revenue += bookingRevenue
      marketAcc.set(b.market, cur)
    }
  }

  const roomNights = roomNightsKeys.size
  const adr = roomNights > 0 ? revenueTotal / roomNights : 0

  function buildDist(map: Map<string, { bookings: number; nights: number; revenue: number }>): DistRow[] {
    const rows: DistRow[] = []
    let totalNights = 0
    for (const v of map.values()) totalNights += v.nights
    for (const [key, v] of map.entries()) {
      rows.push({
        key,
        bookings: v.bookings,
        nights: v.nights,
        revenue: Math.round(v.revenue),
        sharePct: totalNights > 0 ? Math.round((v.nights / totalNights) * 1000) / 10 : 0,
      })
    }
    return rows
  }
  function buildPickup(map: Map<string, { bookings: number; nights: number; revenue: number }>): PickupBucket[] {
    let totalNights = 0
    for (const v of map.values()) totalNights += v.nights
    return PICKUP_BUCKET_ORDER.filter((b) => map.has(b)).map((bucket) => {
      const v = map.get(bucket)!
      return {
        bucket,
        bookings: v.bookings,
        nights: v.nights,
        revenue: Math.round(v.revenue),
        sharePct: totalNights > 0 ? Math.round((v.nights / totalNights) * 1000) / 10 : 0,
      }
    })
  }

  const channelMix = topN(buildDist(channelAcc), 8)
  const rateMix = topN(buildDist(rateAcc), 8)
  const marketMix = topN(buildDist(marketAcc), 8)
  const pickupBuckets = buildPickup(pickupAcc)

  const totalForCancelRate = bookingsCount + cancellationsCount
  const cancelRatePct =
    totalForCancelRate > 0 ? Math.round((cancellationsCount / totalForCancelRate) * 1000) / 10 : 0

  const cancellationsByChannel = topN(buildDist(cancelChannelAcc), 5)

  return {
    range: { from, to, days: daysBetween(from, to), dateMode },
    source: isApiMode ? "scidoo" : "non-api",
    bookingsCount,
    cancellationsCount,
    cancelRatePct,
    roomNights,
    guestNightsApprox,
    revenueTotal: Math.round(revenueTotal * 100) / 100,
    adr: Math.round(adr * 100) / 100,
    revpor: Math.round(adr * 100) / 100,
    losAvgDays: losDays.length ? Math.round((losDays.reduce((s, x) => s + x, 0) / losDays.length) * 10) / 10 : 0,
    losP50: median(losDays),
    leadTimeAvgDays: leadDays.length
      ? Math.round((leadDays.reduce((s, x) => s + x, 0) / leadDays.length) * 10) / 10
      : null,
    leadTimeP25: leadDays.length ? Math.round(quantile(leadDays, 0.25) * 10) / 10 : null,
    leadTimeP50: leadDays.length ? Math.round(quantile(leadDays, 0.5) * 10) / 10 : null,
    leadTimeP75: leadDays.length ? Math.round(quantile(leadDays, 0.75) * 10) / 10 : null,
    channelMix,
    rateMix,
    marketMix,
    pickupBuckets,
    cancellationLeadAvgDays: cancelLeadDays.length
      ? Math.round((cancelLeadDays.reduce((s, x) => s + x, 0) / cancelLeadDays.length) * 10) / 10
      : null,
    cancellationsByChannel,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Date helpers per i confronti (esposti per uso lato API)
// ──────────────────────────────────────────────────────────────────────────

export function shiftRangeYearAgo(from: string, to: string): { from: string; to: string } {
  const shift = (d: string) => {
    const dt = new Date(d)
    dt.setFullYear(dt.getFullYear() - 1)
    return dt.toISOString().slice(0, 10)
  }
  return { from: shift(from), to: shift(to) }
}

export function shiftRangePeriodBefore(from: string, to: string): { from: string; to: string } {
  const days = daysBetween(from, to)
  const dt = new Date(from)
  dt.setDate(dt.getDate() - days)
  const newFrom = dt.toISOString().slice(0, 10)
  const dt2 = new Date(from)
  dt2.setDate(dt2.getDate() - 1)
  const newTo = dt2.toISOString().slice(0, 10)
  return { from: newFrom, to: newTo }
}

export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}
