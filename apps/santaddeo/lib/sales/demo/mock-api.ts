/**
 * Registry dei mock per la DEMO venditori.
 *
 * Strategia "demo-mode che riusa i componenti reali": le pagine demo montano
 * gli STESSI componenti del prodotto (es. <BookingActivityCalendar/>,
 * <PerformanceOtaClient/>). Quei componenti fanno `fetch('/api/...')` per
 * caricare i dati. In demo intercettiamo quelle fetch (vedi
 * components/sales/demo/demo-fetch-interceptor.tsx) e rispondiamo con i dati
 * finti definiti qui — SENZA toccare nessuna route di produzione.
 *
 * Quando il prodotto cambia la UI di un componente, la demo la eredita
 * automaticamente. Se cambia il CONTRATTO di un endpoint, va aggiornato solo
 * il mock corrispondente qui sotto.
 */

export const DEMO_HOTEL_ID = "demo-hotel"

export const DEMO_HOTEL = {
  id: DEMO_HOTEL_ID,
  name: "Hotel Santaddeo",
  organization_id: "demo-org",
  accommodation_type: "camere",
  show_motivational_splash: false,
}

/** PRNG deterministico (mulberry32) per dati stabili tra i reload. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CHANNELS = ["booking_com", "direct", "airbnb", "expedia"]
const ROOM_TYPE_NAMES = ["Standard", "Deluxe", "Suite"]
const GUEST_NAMES = [
  "Marco Rossi", "Giulia Bianchi", "Luca Conti", "Sara Ferrari", "Anna Romano",
  "Paolo Greco", "Elena Costa", "Davide Marino", "Chiara Bruno", "Matteo Gallo",
  "Sophie Martin", "James Wilson", "Hans Müller", "Laura Sánchez", "Yuki Tanaka",
]

const TOTAL_ROOMS = 32

/**
 * Tipologie camera demo. Gli `id` sono condivisi tra la prop `initialRoomTypes`
 * passata a <DashboardOverviewClient/> e il mock di /api/dashboard/availability,
 * cosi' il filtro per room_type_id nel componente reale trova corrispondenza.
 */
export const DEMO_ROOM_TYPES = [
  { id: "rt-standard", name: "Standard", pms_room_type_id: "1", total_rooms: 14, is_active: true, display_order: 1 },
  { id: "rt-deluxe", name: "Deluxe", pms_room_type_id: "2", total_rooms: 12, is_active: true, display_order: 2 },
  { id: "rt-suite", name: "Suite", pms_room_type_id: "3", total_rooms: 6, is_active: true, display_order: 3 },
]

/** ---------------- Calendario (/api/dati/calendario) ---------------- */
function buildCalendario(params: URLSearchParams) {
  const year = Number(params.get("year")) || new Date().getFullYear()
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const dates: Record<string, any> = {}

  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(year, m + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      const r = rng(year * 10000 + (m + 1) * 100 + d)
      // Occupazione stagionale: piu' alta in estate (giu-set)
      const seasonal = m >= 5 && m <= 8 ? 0.75 : m >= 3 && m <= 9 ? 0.55 : 0.35
      const occ = Math.min(1, seasonal + (r() - 0.5) * 0.4)
      const bc = Math.round(occ * TOTAL_ROOMS)
      const cc = r() > 0.85 ? Math.round(r() * 3) : 0
      const avail = Math.max(0, TOTAL_ROOMS - bc)
      const adr = 110 + Math.round(r() * 140)
      const rev = bc * adr
      // Ultima prenotazione ricevuta: piu' recente per date estive
      const daysAgo = Math.round(r() * (occ > 0.6 ? 3 : 20))
      const lbrDate = new Date(today)
      lbrDate.setDate(lbrDate.getDate() - daysAgo)
      const lbr = lbrDate.toISOString().slice(0, 10)

      const itemCount = Math.min(bc, 6)
      const items = Array.from({ length: itemCount }, (_, i) => {
        const ri = rng(year * 100000 + (m + 1) * 1000 + d * 10 + i)
        const nights = 1 + Math.round(ri() * 5)
        const ppn = 100 + Math.round(ri() * 150)
        const isToday = ds >= todayStr && i === 0 && occ > 0.6 && daysAgo === 0
        return {
          g: GUEST_NAMES[Math.floor(ri() * GUEST_NAMES.length)],
          n: nights,
          t: ppn * nights,
          ppn,
          ld: Math.round(ri() * 60),
          ch: CHANNELS[Math.floor(ri() * CHANNELS.length)],
          rt: ROOM_TYPE_NAMES[Math.floor(ri() * ROOM_TYPE_NAMES.length)],
          cx: false,
          bd: isToday ? todayStr : lbr,
        }
      })

      dates[ds] = {
        bc, cc, rn: bc, rev,
        lbr, lcd: cc > 0 ? lbr : null,
        avail, inv: TOTAL_ROOMS,
        items,
      }
    }
  }

  return {
    year,
    hotelId: DEMO_HOTEL_ID,
    totalRooms: TOTAL_ROOMS,
    dates,
    pickupThreshold: { green: 30, orange: 14, red: 0 },
  }
}

/** ---------------- Performance OTA (/api/ota/stats) ---------------- */
function buildOtaStats() {
  const snapshots = Array.from({ length: 12 }, (_, i) => {
    const r = rng(1000 + i)
    const end = new Date()
    end.setMonth(end.getMonth() - i)
    const start = new Date(end)
    start.setMonth(start.getMonth() - 1)
    const searchViews = 8000 + Math.round(r() * 6000)
    const propertyViews = 1800 + Math.round(r() * 1500)
    const bookingsCount = 60 + Math.round(r() * 80)
    return {
      id: `snap-${i}`,
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      search_views: searchViews,
      property_views: propertyViews,
      bookings_count: bookingsCount,
      prev_search_views: Math.round(searchViews * (0.85 + r() * 0.2)),
      prev_property_views: Math.round(propertyViews * (0.85 + r() * 0.2)),
      prev_bookings_count: Math.round(bookingsCount * (0.85 + r() * 0.2)),
      ranking_score: 78 + Math.round(r() * 18),
      ranking_position: 3 + Math.round(r() * 8),
      total_competitors: 40 + Math.round(r() * 20),
      notes: null,
    }
  })

  const channels = [
    { channel: "booking_com", bookings: 184, revenue: 142600, revenueShare: 0.52 },
    { channel: "direct", bookings: 96, revenue: 78400, revenueShare: 0.28 },
    { channel: "airbnb", bookings: 41, revenue: 32100, revenueShare: 0.12 },
    { channel: "expedia", bookings: 28, revenue: 21900, revenueShare: 0.08 },
  ]
  const totalBookings = channels.reduce((s, c) => s + c.bookings, 0)
  const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0)

  return {
    snapshots,
    channelMix: {
      totalBookings,
      totalRevenue,
      bookingComShare: 0.52,
      channels,
    },
    suggestedWeights: {
      bookingShare: 0.52,
      suggestions: [
        { variable_key: "k_booking_visibility", variable_label: "Visibilità Booking", current_weight: 5, suggested_weight: 7, rationale: "Booking pesa il 52.0% del tuo fatturato reale" },
        { variable_key: "k_channel_mix", variable_label: "Mix Canali", current_weight: 4, suggested_weight: 7, rationale: "Booking pesa il 52.0% del tuo fatturato reale" },
      ],
    },
  }
}

/** ---------------- Recensioni (/api/reviews/*) ---------------- */
const REVIEW_PLATFORMS = ["google", "booking", "tripadvisor", "expedia", "airbnb"]
const PLATFORM_AVG: Record<string, number> = {
  google: 4.6, booking: 4.4, tripadvisor: 4.3, expedia: 4.5, airbnb: 4.7,
}

const REVIEW_TEXTS_POS = [
  { t: "Soggiorno perfetto", x: "Posizione ottima, staff cordialissimo e colazione abbondante. Torneremo sicuramente.", topics: ["staff", "colazione", "posizione"] },
  { t: "Camera splendida", x: "Camera pulitissima e silenziosa, letto comodissimo. Vista mare meravigliosa.", topics: ["pulizia", "camera", "vista"] },
  { t: "Esperienza eccellente", x: "Dal check-in al check-out tutto impeccabile. Personale attento ad ogni dettaglio.", topics: ["staff", "check-in"] },
  { t: "Consigliatissimo", x: "Hotel curato, ottimo rapporto qualita prezzo. Colazione varia e di qualita.", topics: ["prezzo", "colazione"] },
]
const REVIEW_TEXTS_NEU = [
  { t: "Buono ma migliorabile", x: "Struttura carina, ma il wifi era lento in camera. Per il resto tutto nella norma.", topics: ["wifi"] },
  { t: "Nella media", x: "Camera ok, parcheggio un po difficile da trovare. Colazione discreta.", topics: ["parcheggio", "colazione"] },
]
const REVIEW_TEXTS_NEG = [
  { t: "Aspettative deluse", x: "Camera rumorosa la notte, pulizia non all altezza del prezzo pagato.", topics: ["rumore", "pulizia"] },
]

function buildReviewsList(params: URLSearchParams) {
  const page = Math.max(0, Number(params.get("page") || "0"))
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || "25")))
  const platformF = params.get("platform")
  const sentimentF = params.get("sentiment")
  const minRating = params.get("minRating")
  const maxRating = params.get("maxRating")
  const q = (params.get("q") || "").trim().toLowerCase()
  const sort = params.get("sort") || "newest"

  const TOTAL = 312
  const all = Array.from({ length: TOTAL }, (_, i) => {
    const r = rng(7000 + i)
    const roll = r()
    const sentiment = roll > 0.78 ? (roll > 0.93 ? "negative" : "neutral") : "positive"
    const pool = sentiment === "positive" ? REVIEW_TEXTS_POS : sentiment === "neutral" ? REVIEW_TEXTS_NEU : REVIEW_TEXTS_NEG
    const tpl = pool[Math.floor(r() * pool.length)]
    const platform = REVIEW_PLATFORMS[Math.floor(r() * REVIEW_PLATFORMS.length)]
    const rating = sentiment === "positive" ? 4 + Math.round(r()) : sentiment === "neutral" ? 3 : 1 + Math.round(r())
    const daysAgo = Math.floor((i / TOTAL) * 540 + r() * 5)
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    const replied = r() > 0.45
    return {
      id: `rev-${i}`,
      platform,
      review_id: `${platform}-${10000 + i}`,
      author_name: GUEST_NAMES[Math.floor(r() * GUEST_NAMES.length)],
      rating,
      title: tpl.t,
      text: tpl.x,
      language: "it",
      review_date: d.toISOString().slice(0, 10),
      stay_date: null,
      response_text: replied ? "Grazie mille per la sua recensione, la aspettiamo di nuovo!" : null,
      sentiment,
      topics: tpl.topics,
    }
  })

  let filtered = all
  if (platformF && platformF !== "all") filtered = filtered.filter((r) => r.platform === platformF)
  if (sentimentF && sentimentF !== "all") filtered = filtered.filter((r) => r.sentiment === sentimentF)
  if (minRating) filtered = filtered.filter((r) => r.rating >= Number(minRating))
  if (maxRating) filtered = filtered.filter((r) => r.rating <= Number(maxRating))
  if (q) filtered = filtered.filter((r) => (r.text + r.title).toLowerCase().includes(q))

  filtered = [...filtered].sort((a, b) => {
    if (sort === "oldest") return a.review_date.localeCompare(b.review_date)
    if (sort === "highest") return b.rating - a.rating
    if (sort === "lowest") return a.rating - b.rating
    return b.review_date.localeCompare(a.review_date)
  })

  const total = filtered.length
  const slice = filtered.slice(page * pageSize, (page + 1) * pageSize)
  return { reviews: slice, total, page, pageSize, hasMore: total > (page + 1) * pageSize }
}

function buildReviewsStats() {
  // Deriva gli aggregati da un campione coerente con buildReviewsList.
  const platforms = REVIEW_PLATFORMS.map((p, i) => {
    const r = rng(8000 + i)
    return { platform: p, count: 30 + Math.round(r() * 60), avg: PLATFORM_AVG[p] }
  })
  const total = platforms.reduce((s, p) => s + p.count, 0)
  const avgRating =
    platforms.reduce((s, p) => s + (p.avg ?? 0) * p.count, 0) / total
  const positive = Math.round(total * 0.78)
  const neutral = Math.round(total * 0.15)
  const negative = total - positive - neutral

  const now = new Date()
  const monthly = Array.from({ length: 12 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1)
    const r = rng(9000 + idx)
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      count: 12 + Math.round(r() * 22),
      avg: Number((4.2 + r() * 0.6).toFixed(2)),
    }
  })

  return {
    total,
    avg_rating: Number(avgRating.toFixed(2)),
    reputation: {
      score: 8.6,
      base_norm: 8.8,
      trend_bonus: 0.3,
      volume_penalty: -0.5,
      reviews_180d: 142,
      rating_30d: 4.6,
      rating_60_90d: 4.4,
    },
    platforms,
    sentiment: { positive, neutral, negative },
    monthly,
    last_sync_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    last_sync_per_platform: REVIEW_PLATFORMS.map((p) => ({
      platform: p,
      at: new Date(Date.now() - 2 * 60_000).toISOString(),
    })),
  }
}

function buildReviewsInsights() {
  return {
    insights: {
      strengths: [
        { title: "Personale eccezionale", description: "Lo staff viene lodato per cortesia e disponibilita in moltissime recensioni.", mentions: 96 },
        { title: "Colazione di qualita", description: "La colazione e tra gli aspetti piu apprezzati, varia e abbondante.", mentions: 71 },
        { title: "Posizione strategica", description: "Vicinanza al centro e ai principali punti di interesse molto valorizzata.", mentions: 64 },
      ],
      weaknesses: [
        { title: "WiFi lento in camera", description: "Alcuni ospiti segnalano connessione instabile ai piani alti.", mentions: 23 },
        { title: "Parcheggio", description: "Difficolta a trovare parcheggio nelle vicinanze in alta stagione.", mentions: 17 },
      ],
      recurring_topics: [
        { topic: "staff", count: 96, sentiment: "positive" as const },
        { topic: "colazione", count: 71, sentiment: "positive" as const },
        { topic: "posizione", count: 64, sentiment: "positive" as const },
        { topic: "pulizia", count: 58, sentiment: "positive" as const },
        { topic: "wifi", count: 23, sentiment: "negative" as const },
        { topic: "parcheggio", count: 17, sentiment: "mixed" as const },
      ],
      summary:
        "Gli ospiti descrivono un'esperienza molto positiva, trainata da uno staff attento, una colazione di qualita e una posizione comoda. Le poche criticita riguardano il WiFi ai piani alti e la disponibilita di parcheggio in alta stagione.",
      generated_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
      reviews_count: 120,
      lookback_days: 180,
    },
    fresh: true,
  }
}

/** ---------------- Analytics (/api/dati/analytics) ---------------- */
const MONTH_LABELS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
const DOW_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]

function buildAnalytics(params: URLSearchParams) {
  const year = Number(params.get("year")) || new Date().getFullYear()
  // Occupazione target per mese (demo "da vetrina": alta stagione ~92%).
  const occTarget = [0.58, 0.62, 0.7, 0.76, 0.84, 0.9, 0.92, 0.93, 0.82, 0.72, 0.6, 0.7]
  const adrByMonth = [150, 152, 165, 178, 196, 220, 245, 250, 205, 180, 158, 185]
  const daysInMonth = (m: number) => new Date(year, m + 1, 0).getDate()
  const monthlyData = MONTH_LABELS_IT.map((label, idx) => {
    const r = rng(year * 100 + idx)
    const available = TOTAL_ROOMS * daysInMonth(idx)
    const roomNights = Math.round(available * occTarget[idx] * (0.98 + r() * 0.04))
    const adr = adrByMonth[idx]
    const revenue = Math.round(roomNights * adr)
    const lyRoomNights = Math.round(roomNights * (0.9 + r() * 0.04))
    const lyRevenue = Math.round(lyRoomNights * adr * (0.93 + r() * 0.03))
    return {
      month: String(idx + 1).padStart(2, "0"),
      monthLabel: label,
      revenue,
      roomNights,
      lyRevenue,
      lyRoomNights,
    }
  })

  const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0)
  const lyTotalRevenue = monthlyData.reduce((s, m) => s + m.lyRevenue, 0)
  const totalRoomNights = monthlyData.reduce((s, m) => s + m.roomNights, 0)
  const lyTotalRoomNights = monthlyData.reduce((s, m) => s + m.lyRoomNights, 0)
  const adr = totalRevenue / totalRoomNights
  const lyAdr = lyTotalRevenue / lyTotalRoomNights
  const availNights = TOTAL_ROOMS * 365
  const occupancy = (totalRoomNights / availNights) * 100
  const lyOccupancy = (lyTotalRoomNights / availNights) * 100
  const revpar = totalRevenue / availNights
  const lyRevpar = lyTotalRevenue / availNights
  const yoy = (c: number, l: number) => (l > 0 ? ((c - l) / l) * 100 : 0)

  const dayOfWeekData = DOW_LABELS.map((label, idx) => {
    const r = rng(year * 10 + idx)
    const weekendBoost = idx >= 4 ? 1.4 : 1
    const revenue = Math.round(42000 * weekendBoost * (0.9 + r() * 0.2))
    return {
      day: String(idx),
      dayLabel: label,
      revenue,
      lyRevenue: Math.round(revenue * 0.88),
      bookings: Math.round(revenue / 220),
      lyBookings: Math.round((revenue * 0.88) / 220),
    }
  })

  const productionDayOfWeekData = DOW_LABELS.map((label, idx) => {
    const r = rng(year * 20 + idx)
    const weekendBoost = idx >= 4 ? 1.35 : 1
    const revenue = Math.round(40000 * weekendBoost * (0.9 + r() * 0.2))
    return {
      day: String(idx),
      dayLabel: label,
      revenue,
      lyRevenue: Math.round(revenue * 0.88),
      roomNights: Math.round(revenue / 180),
      lyRoomNights: Math.round((revenue * 0.88) / 180),
    }
  })

  const revparDayOfWeekData = DOW_LABELS.map((label, idx) => {
    const r = rng(year * 30 + idx)
    const weekendBoost = idx >= 4 ? 1.3 : 1
    const revpar = Math.round((120 * weekendBoost) * (0.9 + r() * 0.2))
    return {
      day: String(idx),
      dayLabel: label,
      revpar,
      lyRevpar: Math.round(revpar * 0.88),
      daysCount: 52,
      lyDaysCount: 52,
    }
  })

  const confirmed = Math.round(totalRoomNights / 2.3)
  const cancelled = Math.round(confirmed * 0.12)
  const bookingStatusData = [
    { status: "confirmed", label: "Confermate", count: confirmed, revenue: totalRevenue, roomNights: totalRoomNights },
    { status: "cancelled", label: "Cancellate", count: cancelled, revenue: Math.round(totalRevenue * 0.1), roomNights: Math.round(totalRoomNights * 0.1) },
  ]

  return {
    kpis: {
      totalRevenue, lyTotalRevenue, revenueYoY: yoy(totalRevenue, lyTotalRevenue),
      totalRoomNights, lyTotalRoomNights, roomNightsYoY: yoy(totalRoomNights, lyTotalRoomNights),
      adr, lyAdr, adrYoY: yoy(adr, lyAdr),
      occupancy, lyOccupancy, occupancyYoY: yoy(occupancy, lyOccupancy),
      revpar, lyRevpar, revparYoY: yoy(revpar, lyRevpar),
    },
    monthlyData,
    dayOfWeekData,
    productionDayOfWeekData,
    revparDayOfWeekData,
    bookingStatusData,
  }
}

/** ---------------- Dashboard overview (/api/dashboard/*) ---------------- */
function buildDashboardAvailability() {
  // Occupazione "oggi" coerente con TOTAL_ROOMS = 32 (14+12+6).
  const occ: Record<string, number> = { "rt-standard": 11, "rt-deluxe": 9, "rt-suite": 4 }
  const oos: Record<string, number> = { "rt-standard": 0, "rt-deluxe": 1, "rt-suite": 0 }
  const data = DEMO_ROOM_TYPES.map((rt) => ({
    room_type_id: rt.id,
    total_rooms: rt.total_rooms,
    rooms_available: rt.total_rooms - occ[rt.id] - oos[rt.id],
    rooms_out_of_service: oos[rt.id],
  }))
  return { source: "rms_availability_daily", data, count: data.length }
}

function buildDashboardProduction() {
  return {
    totalProduction: 312450,
    todayProduction: 6840,
    directRevenue: 124980,
    intermediatedRevenue: 187470,
    departmentBreakdown: { Camere: 248000, Ristorante: 41200, Spa: 14800, Extra: 8450 },
    todayDepartmentBreakdown: { Camere: 5200, Ristorante: 1180, Spa: 460 },
    todayDocumentTypes: {},
    monthDocumentTypes: {},
    roomProductionToday: 5200,
    invoicesTotal: 0,
    feesTotal: 0,
    depositsTotal: 0,
    arrivalsCount: 7,
    arrivalsRoomNights: 19,
    departuresCount: 5,
    stayoversCount: 17,
    cancellationsCount: 1,
    cancelledRoomNights: 3,
    cancelledRevenue: 540,
    revpcr: 180,
    cancelledByChannel: { booking_com: 1 },
    newBookingsCount: 9,
    newBookingsRoomNights: 24,
    newBookingsRevenue: 4320,
    revpor: 180,
    newBookingsByChannel: { booking_com: 5, direct: 2, airbnb: 1, expedia: 1 },
    avgBookingPickup: 18,
    avgCancellationPickup: 9,
    dailyProduction: 6840,
    last24hBookings: 9,
    last24hRoomNights: 24,
    last24hRevpor: 180,
    last24hAvgPickup: 18,
    last24hCancellations: 1,
    last24hCancelledRoomNights: 3,
    last24hLostRevenue: 540,
    last24hCancelRevpor: 180,
    last24hCancelAvgPickup: 9,
    hasDepartmentData: true,
    pmsName: "scidoo",
    prevYear: {
      date: new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10),
      occupancyRate: 72,
      occupiedRooms: 22,
      totalRooms: 32,
      availableRooms: 10,
      totalProduction: 281000,
      todayProduction: 5900,
      roomProductionToday: 4600,
      arrivalsCount: 6,
      arrivalsRoomNights: 16,
      departuresCount: 4,
      stayoversCount: 15,
      cancellationsCount: 2,
      cancelledRoomNights: 5,
      cancelledRevenue: 820,
      revpcr: 164,
      newBookingsCount: 7,
      newBookingsRoomNights: 18,
      newBookingsRevenue: 3360,
      revpor: 187,
    },
  }
}

/** ---------------- Helpers date (mese) ---------------- */
const OCC_TARGET = [0.58, 0.62, 0.7, 0.76, 0.84, 0.9, 0.92, 0.93, 0.82, 0.72, 0.6, 0.7]
const ADR_BY_MONTH = [150, 152, 165, 178, 196, 220, 245, 250, 205, 180, 158, 185]
/** Codici scidoo (PMS) delle tipologie demo, allineati a DEMO_ROOM_TYPES. */
const SCIDOO_CODES: Record<string, string> = { "rt-standard": "1", "rt-deluxe": "2", "rt-suite": "3" }

function pad2(n: number) {
  return String(n).padStart(2, "0")
}
function isoDate(y: number, m0: number, d: number) {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`
}
function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate()
}

/** ---------------- Obiettivi (/api/dati/objectives) ---------------- */
function buildObjectives(params: URLSearchParams) {
  const year = Number(params.get("year")) || new Date().getFullYear()
  const filterAdOggi = params.get("filter") === "ad_oggi"
  const now = new Date()
  const curMonth0 = now.getMonth()
  const isCurYear = year === now.getFullYear()

  const months = MONTH_LABELS_IT.map((label, idx) => {
    const r = rng(year * 100 + idx + 7)
    const dim = daysInMonth(year, idx)
    const camereDisponibili = TOTAL_ROOMS * dim
    const occ = Math.min(0.99, OCC_TARGET[idx] * (0.97 + r() * 0.05))
    const camereVendute = Math.round(camereDisponibili * occ)
    const camereInvendute = camereDisponibili - camereVendute
    const adr = ADR_BY_MONTH[idx]
    const produzioneTotale = Math.round(camereVendute * adr)

    // Produzione "ad oggi": mesi passati = totale, mese corrente = quota parziale,
    // mesi futuri = on-the-books parziale (pickup gia' raccolto).
    let adOggiRatio = 1
    if (isCurYear) {
      if (idx > curMonth0) adOggiRatio = 0.35 + r() * 0.2
      else if (idx === curMonth0) adOggiRatio = Math.min(1, (now.getDate() / dim) * (0.9 + r() * 0.1))
    }
    const produzioneAdOggi = Math.round(produzioneTotale * adOggiRatio)

    const prevYearProduction = Math.round(produzioneTotale * (0.88 + r() * 0.06))
    const prevYearCamereVendute = Math.round(camereVendute * (0.9 + r() * 0.05))
    const prevYearCamereDisponibili = camereDisponibili
    const obiettivo = Math.round(produzioneTotale * (1.04 + r() * 0.06))
    const produzioneRif = filterAdOggi ? produzioneAdOggi : produzioneTotale
    const delta = obiettivo - produzioneRif

    const revpar = camereDisponibili > 0 ? produzioneRif / camereDisponibili : 0
    const revpor = camereVendute > 0 ? produzioneRif / camereVendute : 0
    const prevYearRevpor = prevYearCamereVendute > 0 ? prevYearProduction / prevYearCamereVendute : 0
    const deltaRevpor = revpor - prevYearRevpor
    const occupancyPct = camereDisponibili > 0 ? (camereVendute / camereDisponibili) * 100 : 0
    const prevYearOccupancyPct =
      prevYearCamereDisponibili > 0 ? (prevYearCamereVendute / prevYearCamereDisponibili) * 100 : 0
    const percentualeInvendutoPrevisionale = 10
    const remainingUnsold = Math.round(camereInvendute * (percentualeInvendutoPrevisionale / 100))
    const roomsExpectedToSell = camereVendute + remainingUnsold
    const revporTarget = roomsExpectedToSell > 0 ? obiettivo / roomsExpectedToSell : 0
    const coefficienteRevenue = revpor > 0 ? Number((revpar / revpor).toFixed(2)) : 0

    return {
      month: idx + 1,
      monthLabel: label,
      produzioneAdOggi,
      produzioneTotale,
      prevYearProduction,
      obiettivo,
      delta,
      revpar,
      revpor,
      prevYearRevpor,
      deltaRevpor,
      coefficienteRevenue,
      occupancyPct,
      prevYearOccupancyPct,
      camereVendute,
      camereInvendute,
      camereDisponibili,
      prevYearCamereVendute,
      prevYearCamereDisponibili,
      remainingUnsold,
      percentualeInvendutoPrevisionale,
      prevYearPercInvenduto: 12,
      revporTarget,
      roomsExpectedToSell,
    }
  })

  return { months, availableStatuses: [], connector: "scidoo" }
}

/** ---------------- Camere Vendute / Disponibilita (/api/dati/rooms-sold) ---------------- */
function monthRange(params: URLSearchParams): { y: number; m0: number } {
  const ms = params.get("month_start")
  if (ms) {
    const [y, m] = ms.split("-").map(Number)
    return { y, m0: (m || 1) - 1 }
  }
  const now = new Date()
  return { y: now.getFullYear(), m0: now.getMonth() }
}

function buildRoomsSold(params: URLSearchParams) {
  const { y, m0 } = monthRange(params)
  const dim = daysInMonth(y, m0)
  const roomTypes = DEMO_ROOM_TYPES.map((rt) => ({
    id: rt.id,
    name: rt.name,
    scidoo_room_type_id: Number(SCIDOO_CODES[rt.id]),
    display_order: rt.display_order,
    is_active: rt.is_active,
    total_rooms: rt.total_rooms,
  }))

  const dailyRoomsSold: Record<string, Record<string, { sold: number; total: number; percentage: number }>> = {}
  for (const rt of DEMO_ROOM_TYPES) {
    const code = SCIDOO_CODES[rt.id]
    dailyRoomsSold[code] = {}
    for (let d = 1; d <= dim; d++) {
      const ds = isoDate(y, m0, d)
      const r = rng(y * 10000 + m0 * 100 + d + rt.total_rooms)
      const occ = Math.min(1, OCC_TARGET[m0] * (0.9 + r() * 0.2))
      const total = rt.total_rooms
      const sold = Math.min(total, Math.round(total * occ))
      dailyRoomsSold[code][ds] = {
        sold,
        total,
        percentage: total > 0 ? Math.round((sold / total) * 100) : 0,
      }
    }
  }

  return { roomTypes, dataSource: "rms_availability_daily", dailyRoomsSold }
}

/** ---------------- Produzione giornaliera (/api/dati/production) ---------------- */
function buildDatiProduction(params: URLSearchParams) {
  const { y, m0 } = monthRange(params)
  const dim = daysInMonth(y, m0)
  const dailyPrices: Record<string, Record<string, number>> = {}
  for (const rt of DEMO_ROOM_TYPES) {
    const code = SCIDOO_CODES[rt.id]
    dailyPrices[code] = {}
    const adr = ADR_BY_MONTH[m0]
    for (let d = 1; d <= dim; d++) {
      const ds = isoDate(y, m0, d)
      const r = rng(y * 20000 + m0 * 100 + d + rt.total_rooms)
      const occ = Math.min(1, OCC_TARGET[m0] * (0.9 + r() * 0.2))
      const sold = Math.round(rt.total_rooms * occ)
      const ppn = adr * (rt.id === "rt-suite" ? 1.6 : rt.id === "rt-deluxe" ? 1.25 : 1)
      dailyPrices[code][ds] = Math.round(sold * ppn)
    }
  }
  return { dailyPrices }
}

/** ---------------- PMS last sync (/api/pms/last-sync) ---------------- */
function buildLastSync() {
  return { lastSync: new Date(Date.now() - 22 * 60_000).toISOString() }
}

/** ---------------- Produzione per Canali (/api/accelerator/channel-production) ---------------- */
function buildChannelProduction(params: URLSearchParams) {
  const monthParam = params.get("month")
  let y: number, m0: number
  if (monthParam) {
    const d = new Date(monthParam)
    y = d.getFullYear()
    m0 = d.getMonth()
  } else {
    const now = new Date()
    y = now.getFullYear()
    m0 = now.getMonth()
  }
  const dim = daysInMonth(y, m0)
  const adr = ADR_BY_MONTH[m0]

  const roomTypes = DEMO_ROOM_TYPES.map((rt) => ({
    id: rt.id,
    name: rt.name,
    scidoo_room_type_id: Number(SCIDOO_CODES[rt.id]),
    display_order: rt.display_order,
    is_active: rt.is_active,
    total_rooms: rt.total_rooms,
  }))
  const channels = ["booking_com", "direct", "airbnb", "expedia"]
  const channelShare = [0.5, 0.27, 0.13, 0.1]

  const dailyPricesByRate: Record<string, Record<string, Record<string, number>>> = {}
  const occupancy: Record<string, Record<string, { occupied: number; total: number }>> = {}
  const dailyCounts: Record<string, Record<string, number>> = {}
  const dailyPrices: Record<string, Record<string, number>> = {}

  for (const rt of DEMO_ROOM_TYPES) {
    dailyPricesByRate[rt.id] = {}
    occupancy[rt.id] = {}
    dailyCounts[rt.id] = {}
    dailyPrices[rt.id] = {}
    for (const ch of channels) dailyPricesByRate[rt.id][ch] = {}
    const ppn = adr * (rt.id === "rt-suite" ? 1.6 : rt.id === "rt-deluxe" ? 1.25 : 1)
    for (let d = 1; d <= dim; d++) {
      const ds = isoDate(y, m0, d)
      const r = rng(y * 30000 + m0 * 100 + d + rt.total_rooms)
      const occ = Math.min(1, OCC_TARGET[m0] * (0.9 + r() * 0.2))
      const sold = Math.round(rt.total_rooms * occ)
      occupancy[rt.id][ds] = { occupied: sold, total: rt.total_rooms }
      dailyCounts[rt.id][ds] = sold
      let dayRev = 0
      channels.forEach((ch, ci) => {
        const rev = Math.round(sold * ppn * channelShare[ci])
        if (rev > 0) dailyPricesByRate[rt.id][ch][ds] = rev
        dayRev += rev
      })
      dailyPrices[rt.id][ds] = dayRev
    }
  }

  return { roomTypes, channels, dailyPricesByRate, occupancy, dailyCounts, dailyPrices, prevYear: {} }
}

/** ---------------- Log Invio Prezzi (/api/superadmin/pricing-log) ---------------- */
function buildPricingLog(params: URLSearchParams) {
  const typeFilter = params.get("type") // changes | triggers | pushes | null
  const roomTypeNames = ["Standard", "Deluxe", "Suite"]
  const now = Date.now()
  const logs: any[] = []

  for (let i = 0; i < 60; i++) {
    const r = rng(50000 + i)
    const ts = new Date(now - i * 3_600_000 * (2 + r() * 3)).toISOString()
    const roll = r()
    const targetDate = isoDate(
      new Date(now + (i % 30) * 86_400_000).getFullYear(),
      new Date(now + (i % 30) * 86_400_000).getMonth(),
      new Date(now + (i % 30) * 86_400_000).getDate(),
    )
    if (roll < 0.5) {
      const oldPrice = 120 + Math.round(r() * 140)
      const newPrice = oldPrice + Math.round((r() - 0.4) * 40)
      logs.push({
        id: `pc-${i}`,
        type: "price_change",
        hotelId: DEMO_HOTEL_ID,
        hotelName: DEMO_HOTEL.name,
        timestamp: ts,
        summary: `${roomTypeNames[i % 3]} ${targetDate}: ${oldPrice}€ -> ${newPrice}€`,
        detail: {
          targetDate,
          oldPrice,
          newPrice,
          source: r() > 0.5 ? "autopilot" : "griglia",
          occupancy: `${60 + Math.round(r() * 35)}%`,
        },
      })
    } else if (roll < 0.78) {
      const changesCount = 3 + Math.round(r() * 18)
      const changes = Array.from({ length: Math.min(10, changesCount) }, (_, k) => {
        const cur = 120 + Math.round(rng(60000 + i * 100 + k)() * 140)
        return {
          date: isoDate(new Date(now + k * 86_400_000).getFullYear(), new Date(now + k * 86_400_000).getMonth(), new Date(now + k * 86_400_000).getDate()),
          roomTypeName: roomTypeNames[k % 3],
          currentPrice: cur,
          suggestedPrice: cur + Math.round((rng(61000 + i * 100 + k)() - 0.4) * 36),
        }
      })
      logs.push({
        id: `at-${i}`,
        type: "autopilot_trigger",
        hotelId: DEMO_HOTEL_ID,
        hotelName: DEMO_HOTEL.name,
        timestamp: ts,
        summary: `Autopilot: ${changesCount} variazioni proposte`,
        detail: {
          mode: r() > 0.5 ? "autopilot" : "notify",
          changesCount,
          roomTypes: roomTypeNames,
          notificationSent: r() > 0.4,
          changes,
        },
      })
    } else {
      const ok = r() > 0.15
      logs.push({
        id: `pr-${i}`,
        type: "push_result",
        hotelId: DEMO_HOTEL_ID,
        hotelName: DEMO_HOTEL.name,
        timestamp: ts,
        summary: ok ? "Invio prezzi al PMS completato" : "Invio prezzi al PMS fallito",
        detail: {
          changesCount: 5 + Math.round(r() * 20),
          pushResult: {
            success: ok,
            method: "brig_api",
            cellsOrRecords: 20 + Math.round(r() * 60),
            errors: ok ? [] : ["Timeout connessione PMS"],
          },
        },
      })
    }
  }

  let filtered = logs
  if (typeFilter === "changes") filtered = logs.filter((l) => l.type === "price_change")
  else if (typeFilter === "triggers") filtered = logs.filter((l) => l.type === "autopilot_trigger")
  else if (typeFilter === "pushes") filtered = logs.filter((l) => l.type === "push_result")

  return { logs: filtered, hotelMap: { [DEMO_HOTEL_ID]: DEMO_HOTEL.name } }
}

/** ---------------- Guard (/api/guard/*, /api/rates) ---------------- */
const DEMO_RATES = [
  { id: "rate-bb", name: "Bed & Breakfast", code: "BB" },
  { id: "rate-pern", name: "Solo Pernottamento", code: "RO" },
  { id: "rate-nonref", name: "Non Rimborsabile", code: "NR" },
  { id: "rate-hb", name: "Mezza Pensione", code: "HB" },
]

function buildGuardConfig() {
  return { tolerancePct: 5.0, timeToleranceMin: 60 }
}

function buildRates() {
  return { rates: DEMO_RATES }
}

function buildGuardChecks(params: URLSearchParams) {
  const days = Number(params.get("days") || "2")
  const now = Date.now()
  const channels = ["booking_com", "direct", "airbnb", "expedia"]
  const rtIds = DEMO_ROOM_TYPES.map((r) => r.id)
  const count = Math.min(60, 14 + days * 6)
  const checks = Array.from({ length: count }, (_, i) => {
    const r = rng(70000 + i)
    const roll = r()
    // Distribuzione: ~78% ok, ~14% warning, ~8% mismatch.
    const result: "ok" | "warning" | "mismatch" = roll > 0.92 ? "mismatch" : roll > 0.78 ? "warning" : "ok"
    const expected = 120 + Math.round(r() * 160)
    let booked = expected
    if (result === "ok") booked = expected + Math.round(r() * 40) // pari o sovra-prezzo
    else if (result === "warning") booked = Math.round(expected * (0.95 - r() * 0.03))
    else booked = Math.round(expected * (0.85 - r() * 0.1))
    const diffPct = ((booked - expected) / expected) * 100

    const bookingMsAgo = Math.round(r() * days * 86_400_000)
    const bookingDate = new Date(now - bookingMsAgo)
    const checkinDate = new Date(now + (3 + Math.round(r() * 40)) * 86_400_000)
    const nights = 1 + Math.round(r() * 4)
    const checkoutDate = new Date(checkinDate.getTime() + nights * 86_400_000)
    const rtId = rtIds[i % rtIds.length]
    const rate = DEMO_RATES[i % DEMO_RATES.length]
    const ds = (d: Date) => d.toISOString().slice(0, 10)

    return {
      id: `gc-${i}`,
      hotel_id: DEMO_HOTEL_ID,
      booking_id: `bk-${10000 + i}`,
      booking_date: ds(bookingDate),
      checkin_date: ds(checkinDate),
      checkout_date: ds(checkoutDate),
      room_type_id: rtId,
      rate_id: rate.id,
      occupancy: 2,
      booked_price: booked,
      expected_price: expected,
      difference_pct: diffPct,
      tolerance_pct: 5,
      result,
      checked_at: new Date(now - Math.round(r() * 3_600_000)).toISOString(),
      night_index: 0,
      sent_at: new Date(bookingDate.getTime() - 3_600_000).toISOString(),
      minutes_before_booking: 30 + Math.round(r() * 600),
      notes: null,
      channel: channels[Math.floor(r() * channels.length)],
      guest_name: GUEST_NAMES[Math.floor(r() * GUEST_NAMES.length)],
      stay_nights: nights,
      rate_name: rate.name,
      is_multi_rate: false,
      is_overridden: false,
      rate_id_override: null,
    }
  })
  return { checks }
}

/** ---------------- Pricing (griglia AI reale) ---------------- */
const PRICING_RATES = [
  { id: "rate-bb", name: "Bed & Breakfast", code: "BB", is_active: true, rate_type: "standard" as const, parent_rate_id: null },
  { id: "rate-nr", name: "Non Rimborsabile", code: "NR", is_active: true, rate_type: "nr" as const, parent_rate_id: "rate-bb" },
]
const PRICING_BASE: Record<string, number> = { "rt-standard": 140, "rt-deluxe": 185, "rt-suite": 285 }

function pricingRoomTypes() {
  return DEMO_ROOM_TYPES.map((rt) => ({
    id: rt.id,
    name: rt.name,
    code: SCIDOO_CODES[rt.id],
    capacity: 2,
    capacity_default: 2,
    min_occupancy: 2,
    max_occupancy: 2,
    additional_beds: 0,
    total_rooms: rt.total_rooms,
    is_active: true,
  }))
}

function buildPricingGrid(params: URLSearchParams) {
  const { y, m0 } = monthRange(params)
  const dim = daysInMonth(y, m0)
  const roomTypes = pricingRoomTypes()
  const rates = PRICING_RATES.map((r) => ({
    ...r,
    room_type_ids: DEMO_ROOM_TYPES.map((rt) => rt.id),
  }))

  const prices: Record<string, Record<string, number>> = {}
  const occupancy: Record<string, Record<string, { total: number; available: number; occupied: number }>> = {}

  for (const rt of DEMO_ROOM_TYPES) {
    occupancy[rt.id] = {}
    for (const rate of PRICING_RATES) {
      const key = `${rt.id}_${rate.id}_2`
      prices[key] = {}
      for (let d = 1; d <= dim; d++) {
        const ds = isoDate(y, m0, d)
        const r = rng(y * 40000 + m0 * 100 + d + rt.total_rooms + rate.code.charCodeAt(0))
        const dow = new Date(y, m0, d).getDay()
        const weekend = dow === 5 || dow === 6 ? 1.25 : 1
        const seasonal = 0.85 + OCC_TARGET[m0] * 0.4
        let price = PRICING_BASE[rt.id] * weekend * seasonal * (0.97 + r() * 0.06)
        if (rate.rate_type === "nr") price *= 0.92 // Non rimborsabile leggermente piu' bassa
        prices[key][ds] = Math.round(price)
      }
    }
    // Occupancy per giorno (condivisa tra le tariffe della stessa camera)
    for (let d = 1; d <= dim; d++) {
      const ds = isoDate(y, m0, d)
      const r = rng(y * 41000 + m0 * 100 + d + rt.total_rooms)
      const occ = Math.min(1, OCC_TARGET[m0] * (0.88 + r() * 0.24))
      const occupied = Math.round(rt.total_rooms * occ)
      occupancy[rt.id][ds] = { total: rt.total_rooms, available: rt.total_rooms - occupied, occupied }
    }
  }

  return {
    roomTypes,
    rates,
    prices,
    occupancy,
    algoParams: {},
    occupancyBands: [],
    bandGroups: [],
    lastMinuteLevels: [],
  }
}

function buildPricingSubscription() {
  return { subscriptions: [{ algorithm_type: "advanced", status: "active" }] }
}

function buildRateLimits() {
  const rateLimits = DEMO_ROOM_TYPES.map((rt) => ({
    room_type_id: rt.id,
    room_type_name: rt.name,
    bottom_rate: Math.round(PRICING_BASE[rt.id] * 0.6),
    rack_rate: Math.round(PRICING_BASE[rt.id] * 2.2),
  }))
  return { rateLimits }
}

function buildPricingVariables() {
  return { variables: [] }
}

const WEATHER_DESCRIPTIONS = [
  { d: "Sereno", score: 95, pp: 0 },
  { d: "Poco nuvoloso", score: 80, pp: 10 },
  { d: "Nuvoloso", score: 60, pp: 25 },
  { d: "Pioggia leggera", score: 35, pp: 70 },
]

function buildWeather() {
  const start = new Date()
  start.setDate(1)
  const forecasts = Array.from({ length: 75 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const r = rng(80000 + i)
    const month = d.getMonth()
    const summer = month >= 5 && month <= 8
    const w = WEATHER_DESCRIPTIONS[Math.floor(r() * (summer ? 2.2 : 4))] || WEATHER_DESCRIPTIONS[0]
    const tmax = (summer ? 28 : 16) + Math.round(r() * 6)
    return {
      date: d.toISOString().slice(0, 10),
      weatherScore: w.score,
      temperatureMax: tmax,
      temperatureMin: tmax - 7 - Math.round(r() * 3),
      weatherDescription: w.d,
      precipitationProbability: w.pp,
    }
  })
  return { forecasts, prevYearWeather: [] }
}

function buildEvents(params: URLSearchParams) {
  const from = params.get("from")
  const to = params.get("to")
  if (!from || !to) return { events: [] }
  const fromD = new Date(from)
  const toD = new Date(to)
  const pool = [
    { name: "Festival del Cinema", type: "cultura", impact: "high", color: "#dc2626" },
    { name: "Fiera Internazionale", type: "fiera", impact: "high", color: "#dc2626" },
    { name: "Concerto in piazza", type: "musica", impact: "medium", color: "#f59e0b" },
    { name: "Maratona cittadina", type: "sport", impact: "medium", color: "#f59e0b" },
    { name: "Mercatino locale", type: "mercato", impact: "low", color: "#10b981" },
  ]
  const events: any[] = []
  const span = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / 86_400_000))
  for (let i = 0; i < 4; i++) {
    const r = rng(90000 + fromD.getMonth() * 10 + i)
    const dayOffset = Math.floor(r() * span)
    const d = new Date(fromD)
    d.setDate(d.getDate() + dayOffset)
    const ev = pool[Math.floor(r() * pool.length)]
    events.push({
      id: `ev-${fromD.getMonth()}-${i}`,
      name: ev.name,
      type: ev.type,
      country_code: "IT",
      impact: ev.impact,
      color: ev.color,
      date: d.toISOString().slice(0, 10),
    })
  }
  return { events }
}

function buildAutopilotConfig() {
  return {
    mode: "notify",
    notify_emails: ["revenue@hotelsantaddeo.it"],
    last_notification_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    last_push_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    last_full_sync_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
  }
}

function buildRatesList() {
  return {
    rates: PRICING_RATES.map((r) => ({ id: r.id, name: r.name, isDerived: r.rate_type === "nr" })),
  }
}

/** ---------------- Insight AI (/api/ai-report/*) ---------------- */
function aiReportKpi(opts: {
  from: string
  to: string
  days: number
  revenueTotal: number
  roomNights: number
  compareLabel: string | null
}) {
  const { from, to, days, revenueTotal, roomNights, compareLabel } = opts
  const revpor = roomNights > 0 ? revenueTotal / roomNights : 0
  return {
    hotelName: DEMO_HOTEL.name,
    range: { from, to, days, dateMode: "stay" as const },
    compareLabel,
    compareRequested: !!compareLabel,
    compareDataAvailable: !!compareLabel,
    kpis: {
      revenueTotal,
      revenueDeltaPct: compareLabel ? 12.4 : null,
      roomNights,
      roomNightsDeltaPct: compareLabel ? 6.1 : null,
      revpor,
      revporDeltaPct: compareLabel ? 5.9 : null,
      leadTimeAvgDays: 38.5,
      leadTimeDeltaPct: compareLabel ? -8.2 : null,
      cancelRatePct: 9.3,
      cancelRateDeltaPp: compareLabel ? -1.4 : null,
    },
  }
}

const AI_REPORT_TEXT_30D = `## Sintesi del periodo

Nel periodo analizzato l'hotel ha generato **187.400 €** di produzione su **961 camere-notte**, con un **RevPOR di 195 €**. Il confronto anno su anno mostra una crescita del **+12,4%** sulla produzione, trainata soprattutto dal miglioramento del RevPOR (**+5,9%**) e da un aumento delle camere-notte vendute (**+6,1%**).

## Punti di forza

- **RevPOR in crescita**: il ricavo medio per camera occupata sale a 195 €, segno che la strategia di pricing dinamico sta intercettando bene la domanda nelle date di alta richiesta.
- **Lead time in calo (-8,2%)**: le prenotazioni arrivano mediamente 38,5 giorni prima del check-in. La riduzione indica una domanda più reattiva, utile per spingere offerte last-minute mirate.
- **Cancellazioni in miglioramento**: il tasso scende al 9,3% (-1,4 punti), effetto del maggior peso delle tariffe non rimborsabili.

## Aree di attenzione

- I canali OTA continuano a pesare per oltre il 60% della produzione: una quota di disintermediazione più alta migliorerebbe il margine.
- Alcune date infrasettimanali di bassa stagione restano sotto il 60% di occupazione: valutare promozioni di soggiorno minimo o pacchetti esperienziali.

## Raccomandazioni operative

1. **Spingere il canale diretto** con un vantaggio tariffario esclusivo del 5% e colazione inclusa, per ridurre le commissioni OTA.
2. **Aumentare i prezzi** nei weekend di alta stagione dove l'occupazione supera già l'85% con 30+ giorni di anticipo.
3. **Attivare offerte last-minute** dinamiche sulle date infrasettimanali ancora deboli, sfruttando il lead time in calo.`

const AI_REPORT_TEXT_7D = `## Sintesi della settimana

Nell'ultima settimana la produzione è stata di **48.900 €** su **236 camere-notte**, con un **RevPOR di 207 €**. La domanda si è concentrata nel weekend, con il sabato in sold-out su Suite e Deluxe.

## Osservazioni

- **Pickup forte sul weekend**: la spinta tariffaria applicata venerdì e sabato ha tenuto, senza segnali di resistenza al prezzo.
- **Infrasettimanale debole**: martedì e mercoledì restano sotto il 65% di occupazione.

## Azioni consigliate

1. Mantenere la griglia attuale sul weekend, è ben calibrata.
2. Lanciare un'offerta "3=2" per soggiorni infrasettimanali nelle prossime 2 settimane.`

interface AiReportRecord {
  id: string
  created_at: string
  range_from: string
  range_to: string
  date_mode: "booking" | "stay"
  compare_yoy: boolean
  compare_period_before: boolean
  hotel_name: string
  user_id: string | null
  kpi_payload: ReturnType<typeof aiReportKpi>
  report_text: string
}

function aiReportRecords(): AiReportRecord[] {
  const now = Date.now()
  const day = 86_400_000
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return [
    {
      id: "air-1",
      created_at: new Date(now - 2 * day).toISOString(),
      range_from: iso(now - 32 * day),
      range_to: iso(now - 2 * day),
      date_mode: "stay",
      compare_yoy: true,
      compare_period_before: false,
      hotel_name: DEMO_HOTEL.name,
      user_id: "demo-user",
      kpi_payload: aiReportKpi({
        from: iso(now - 32 * day),
        to: iso(now - 2 * day),
        days: 30,
        revenueTotal: 187400,
        roomNights: 961,
        compareLabel: "Anno precedente",
      }),
      report_text: AI_REPORT_TEXT_30D,
    },
    {
      id: "air-2",
      created_at: new Date(now - 9 * day).toISOString(),
      range_from: iso(now - 16 * day),
      range_to: iso(now - 9 * day),
      date_mode: "stay",
      compare_yoy: false,
      compare_period_before: false,
      hotel_name: DEMO_HOTEL.name,
      user_id: "demo-user",
      kpi_payload: aiReportKpi({
        from: iso(now - 16 * day),
        to: iso(now - 9 * day),
        days: 7,
        revenueTotal: 48900,
        roomNights: 236,
        compareLabel: null,
      }),
      report_text: AI_REPORT_TEXT_7D,
    },
  ]
}

function buildAiReportHistory() {
  const items = aiReportRecords().map((r) => ({
    id: r.id,
    created_at: r.created_at,
    range_from: r.range_from,
    range_to: r.range_to,
    date_mode: r.date_mode,
    compare_yoy: r.compare_yoy,
    compare_period_before: r.compare_period_before,
    hotel_name: r.hotel_name,
    user_id: r.user_id,
    kpi_summary: {
      compareLabel: r.kpi_payload.compareLabel,
      compareDataAvailable: r.kpi_payload.compareDataAvailable ?? null,
      revenueTotal: r.kpi_payload.kpis.revenueTotal,
      roomNights: r.kpi_payload.kpis.roomNights,
      revpor: r.kpi_payload.kpis.revpor,
      revenueDeltaPct: r.kpi_payload.kpis.revenueDeltaPct,
      cancelRatePct: r.kpi_payload.kpis.cancelRatePct,
      days: r.kpi_payload.range.days,
    },
  }))
  return { items }
}

function buildAiReportDetail(pathname: string) {
  const id = pathname.split("/").pop()
  const rec = aiReportRecords().find((r) => r.id === id) || aiReportRecords()[0]
  return { report: rec }
}

/** ---------------- Area Revenue Manager (/api/revman/*) ---------------- */
function buildRevmanNotes() {
  const now = Date.now()
  const day = 86_400_000
  return {
    notes: [
      {
        id: "note-1",
        hotel_id: DEMO_HOTEL_ID,
        author_role: "staff" as const,
        title: "Strategia weekend alta stagione",
        body: "Confermata la spinta tariffaria sui weekend di luglio e agosto. Monitorare il pickup a 30 giorni e alzare ulteriormente Suite se l'occupazione supera l'85%.",
        pinned: true,
        created_at: new Date(now - 3 * day).toISOString(),
        updated_at: new Date(now - 3 * day).toISOString(),
      },
      {
        id: "note-2",
        hotel_id: DEMO_HOTEL_ID,
        author_role: "tenant" as const,
        title: "Richiesta gruppo agenzia",
        body: "Arrivata richiesta per 12 camere a settembre da un'agenzia. Valutiamo insieme la quotazione nella prossima call.",
        pinned: false,
        created_at: new Date(now - 6 * day).toISOString(),
        updated_at: new Date(now - 6 * day).toISOString(),
      },
    ],
  }
}

function buildRevmanActivities() {
  const now = Date.now()
  const day = 86_400_000
  return {
    activities: [
      {
        id: "act-1",
        hotel_id: DEMO_HOTEL_ID,
        title: "Rivedere griglia prezzi settembre",
        description: "Ottimizzare le tariffe infrasettimanali di settembre con la nuova previsione meteo ed eventi.",
        status: "in_progress" as const,
        due_date: new Date(now + 4 * day).toISOString().slice(0, 10),
        assigned_to: "staff" as const,
        created_at: new Date(now - 2 * day).toISOString(),
        completed_at: null,
      },
      {
        id: "act-2",
        hotel_id: DEMO_HOTEL_ID,
        title: "Inviare report mensile alla proprietà",
        description: null,
        status: "done" as const,
        due_date: new Date(now - 1 * day).toISOString().slice(0, 10),
        assigned_to: "staff" as const,
        created_at: new Date(now - 8 * day).toISOString(),
        completed_at: new Date(now - 1 * day).toISOString(),
      },
      {
        id: "act-3",
        hotel_id: DEMO_HOTEL_ID,
        title: "Configurare tariffa non rimborsabile su Expedia",
        description: "Allineare la NR anche sul canale Expedia per aumentare il peso delle tariffe garantite.",
        status: "open" as const,
        due_date: new Date(now + 9 * day).toISOString().slice(0, 10),
        assigned_to: "tenant" as const,
        created_at: new Date(now - 1 * day).toISOString(),
        completed_at: null,
      },
    ],
  }
}

function buildRevmanFiles() {
  const now = Date.now()
  const day = 86_400_000
  return {
    files: [
      {
        id: "file-1",
        hotel_id: DEMO_HOTEL_ID,
        file_name: "Report_Revenue_Mensile.pdf",
        mime_type: "application/pdf",
        size_bytes: 842_000,
        blob_url: "#",
        category: "report",
        description: "Report revenue del mese con analisi pickup e forecast.",
        uploaded_by_role: "staff" as const,
        created_at: new Date(now - 2 * day).toISOString(),
      },
      {
        id: "file-2",
        hotel_id: DEMO_HOTEL_ID,
        file_name: "Strategia_Alta_Stagione_2026.pptx",
        mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size_bytes: 3_120_000,
        blob_url: "#",
        category: "presentazione",
        description: "Presentazione della strategia tariffaria per l'alta stagione.",
        uploaded_by_role: "staff" as const,
        created_at: new Date(now - 10 * day).toISOString(),
      },
    ],
  }
}

function buildAiChatSessions() {
  const now = Date.now()
  const day = 86_400_000
  return {
    sessions: [
      { id: "chat-1", title: "Analisi pickup weekend di agosto", created_at: new Date(now - 1 * day).toISOString(), hotel_name: DEMO_HOTEL.name },
      { id: "chat-2", title: "Confronto RevPAR vs anno precedente", created_at: new Date(now - 5 * day).toISOString(), hotel_name: DEMO_HOTEL.name },
    ],
  }
}

/** ---------------- Trend Tariffe & Occupazione (/api/accelerator/rate-trend) ----------------
 * Replica il contratto di app/api/accelerator/rate-trend/route.ts: per ogni
 * data del range restituisce tariffa attuale/di partenza, serie evolutiva,
 * occupazione di struttura, camere vendute, ricavo e RevPor. I prezzi seguono
 * la STESSA formula di buildPricingGrid, cosi' il trend e' coerente con la
 * griglia Pricing mostrata altrove nella demo.
 */
function buildRateTrend(params: URLSearchParams) {
  const roomTypeId = params.get("room_type_id") || "__all__"
  const rateId = params.get("rate_id") || "rate-bb"
  const from = params.get("from")
  const to = params.get("to")
  if (!from || !to) return { days: [] }

  const isNR = rateId === "rate-nr"
  const allRoomTypes = roomTypeId === "__all__"
  const targetRT = DEMO_ROOM_TYPES.find((rt) => rt.id === roomTypeId) || null

  const priceFor = (rtId: string, y: number, m0: number, d: number) => {
    const dow = new Date(y, m0, d).getDay()
    const weekend = dow === 5 || dow === 6 ? 1.25 : 1
    const seasonal = 0.85 + OCC_TARGET[m0] * 0.4
    const r = rng(y * 40000 + m0 * 100 + d + (PRICING_BASE[rtId] || 100))
    let price = (PRICING_BASE[rtId] || 140) * weekend * seasonal * (0.97 + r() * 0.06)
    if (isNR) price *= 0.92
    return Math.round(price)
  }

  const start = new Date(from + "T00:00:00")
  const end = new Date(to + "T00:00:00")
  const days: any[] = []

  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    const y = dt.getFullYear()
    const m0 = dt.getMonth()
    const d = dt.getDate()
    const dateStr = `${y}-${pad2(m0 + 1)}-${pad2(d)}`

    // Occupazione per tipologia (stessa formula di buildPricingGrid).
    let hotelOccupied = 0
    let targetOccupied = 0
    let hotelRevenue = 0
    const priceVals: number[] = []
    for (const rt of DEMO_ROOM_TYPES) {
      const ro = rng(y * 41000 + m0 * 100 + d + rt.total_rooms)
      const occ = Math.min(1, OCC_TARGET[m0] * (0.88 + ro() * 0.24))
      const occupied = Math.round(rt.total_rooms * occ)
      hotelOccupied += occupied
      const p = priceFor(rt.id, y, m0, d)
      hotelRevenue += occupied * p
      if (rt.id === roomTypeId) {
        targetOccupied = occupied
        priceVals.push(p)
      }
      if (allRoomTypes) priceVals.push(p)
    }

    const currentPrice = allRoomTypes
      ? Math.round(priceVals.reduce((a, b) => a + b, 0) / Math.max(1, priceVals.length))
      : priceFor(roomTypeId, y, m0, d)

    // Serie evolutiva: alcune variazioni nelle ultime ~40 giorni.
    const rc = rng(y * 50000 + m0 * 137 + d * 7 + (isNR ? 11 : 3))
    const changeCount = Math.floor(rc() * 4) // 0..3
    const evolutionSeries: { timestamp: string; price: number }[] = []
    let startingPrice = currentPrice
    let lastUpdated: string | null = null
    if (changeCount > 0) {
      startingPrice = Math.round(currentPrice * (0.88 + rc() * 0.18))
      const spanDays = 40
      const now = Date.now()
      for (let i = 0; i <= changeCount; i++) {
        const price = Math.round(startingPrice + ((currentPrice - startingPrice) * i) / changeCount)
        const ts = new Date(now - (spanDays - (spanDays * i) / changeCount) * 86_400_000).toISOString()
        evolutionSeries.push({ timestamp: ts, price })
      }
      lastUpdated = evolutionSeries[evolutionSeries.length - 1].timestamp
    }

    const occupancyPct = Math.round((hotelOccupied / TOTAL_ROOMS) * 1000) / 10
    const roomsSold = allRoomTypes ? hotelOccupied : targetOccupied
    const roomTypeTotalRooms = allRoomTypes ? TOTAL_ROOMS : targetRT?.total_rooms ?? null
    const revpor = hotelOccupied > 0 ? Math.round((hotelRevenue / hotelOccupied) * 100) / 100 : null

    days.push({
      date: dateStr,
      currentPrice,
      startingPrice,
      changeCount,
      evolutionSeries,
      lastUpdated,
      roomsSold,
      roomTypeTotalRooms,
      hotelRoomsOccupied: hotelOccupied,
      hotelTotalRooms: TOTAL_ROOMS,
      occupancyPct,
      roomRevenue: Math.round(hotelRevenue * 100) / 100,
      revpor,
    })
  }

  return { days }
}

/** Curva di pickup occupazione per il dialog dettaglio giorno
 * (/api/accelerator/rate-trend/occupancy-pickup). Ritorna { series, capacity }
 * con la salita dell'occupato nei ~60 giorni precedenti la data di soggiorno.
 */
function buildOccupancyPickup(params: URLSearchParams) {
  const capacity = TOTAL_ROOMS
  const date = params.get("date")
  if (!date) return { series: [], capacity }
  const stay = new Date(date + "T00:00:00")
  const m0 = stay.getMonth()
  const finalOccPct = Math.round(Math.min(1, OCC_TARGET[m0] * 1.02) * 100)
  const points = 12
  const series: { date: string; occupied: number; occupancyPct: number }[] = []
  for (let i = 0; i <= points; i++) {
    const daysBefore = Math.round((60 * (points - i)) / points)
    const bookingDate = new Date(stay.getTime() - daysBefore * 86_400_000)
    const progress = i / points
    // Salita non lineare (piu' prenotazioni sotto data).
    const occPct = Math.round(finalOccPct * (0.12 + Math.pow(progress, 1.4) * 0.88))
    const occupied = Math.round((occPct / 100) * capacity)
    series.push({ date: bookingDate.toISOString().slice(0, 10), occupied, occupancyPct: occPct })
  }
  return { series, capacity }
}

/** ---------------- Booking Pace (/api/accelerator/pace) ---------------- */
function eachDate(from: string, to: string, maxDays = 400): string[] {
  const out: string[] = []
  const start = new Date(from + "T00:00:00")
  const end = new Date(to + "T00:00:00")
  const cur = new Date(start)
  while (cur <= end && out.length < maxDays) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function median(nums: number[]): number | null {
  const arr = nums.filter((n) => typeof n === "number").sort((a, b) => a - b)
  if (arr.length === 0) return null
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2)
}

function buildPace(params: URLSearchParams) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const from = params.get("from") || todayStr
  const to = params.get("to") || new Date(today.getFullYear(), today.getMonth() + 3, 0).toISOString().slice(0, 10)

  // Mesi compresi nel range richiesto.
  const startM = new Date(from + "T00:00:00")
  const endM = new Date(to + "T00:00:00")
  const months: Array<{ y: number; m: number }> = []
  const cur = new Date(startM.getFullYear(), startM.getMonth(), 1)
  while (cur <= endM && months.length < 18) {
    months.push({ y: cur.getFullYear(), m: cur.getMonth() })
    cur.setMonth(cur.getMonth() + 1)
  }

  // Scenario "da vetrina": meno camere ma ADR piu' alto -> ricavo in crescita.
  const byMonth = months.map(({ y, m }, idx) => {
    const r = rng(y * 100 + m + 1)
    const seasonal = m >= 5 && m <= 8 ? 1.35 : m >= 3 && m <= 9 ? 1.05 : 0.7
    const rooms = Math.round((120 + r() * 90) * seasonal)
    const adr = Math.round((170 + r() * 70) * (m >= 5 && m <= 8 ? 1.2 : 1))
    const revenue = rooms * adr
    // STLY: piu' camere, ADR piu' basso.
    const stlyRooms = Math.round(rooms * (1.04 + r() * 0.06))
    const stlyAdr = Math.round(adr * (0.86 + r() * 0.05))
    const stlyRevenue = stlyRooms * stlyAdr
    const monthStr = `${y}-${String(m + 1).padStart(2, "0")}`
    return {
      month: monthStr,
      rooms,
      revenue,
      adr,
      stlyRooms,
      stlyRevenue,
      stlyAdr,
      roomsVarPct: stlyRooms > 0 ? ((rooms - stlyRooms) / stlyRooms) * 100 : null,
      revenueVarPct: stlyRevenue > 0 ? ((revenue - stlyRevenue) / stlyRevenue) * 100 : null,
    }
  })

  const current = byMonth.reduce(
    (acc, mo) => ({ rooms: acc.rooms + mo.rooms, revenue: acc.revenue + mo.revenue }),
    { rooms: 0, revenue: 0 },
  )
  const stly = byMonth.reduce(
    (acc, mo) => ({ rooms: acc.rooms + mo.stlyRooms, revenue: acc.revenue + mo.stlyRevenue }),
    { rooms: 0, revenue: 0 },
  )
  const currentTotals: PaceTotalsMock = {
    rooms: current.rooms,
    revenue: current.revenue,
    adr: current.rooms > 0 ? Math.round(current.revenue / current.rooms) : 0,
  }
  const stlyTotals: PaceTotalsMock = {
    rooms: stly.rooms,
    revenue: stly.revenue,
    adr: stly.rooms > 0 ? Math.round(stly.revenue / stly.rooms) : 0,
  }

  // Curva di prenotazione: accumulo a ritroso (da 120 gg prima a oggi).
  const curveSteps = [120, 105, 90, 75, 60, 45, 30, 21, 14, 10, 7, 3, 0]
  const curve = curveSteps.map((daysBefore, i) => {
    const progress = (curveSteps.length - 1 - i) / (curveSteps.length - 1) // 0 -> 1 verso oggi
    const cyRooms = Math.round(currentTotals.rooms * Math.pow(progress, 0.85))
    const lyRooms = Math.round(stlyTotals.rooms * Math.pow(progress, 0.95))
    const cyRevenue = Math.round(currentTotals.revenue * Math.pow(progress, 0.85))
    const lyRevenue = Math.round(stlyTotals.revenue * Math.pow(progress, 0.95))
    return { daysBefore, cyRooms, lyRooms, cyRevenue, lyRevenue }
  })

  return {
    range: { from, to, today: todayStr, leadDays: 0 },
    current: currentTotals,
    stly: stlyTotals,
    variance: {
      roomsPct: stlyTotals.rooms > 0 ? ((currentTotals.rooms - stlyTotals.rooms) / stlyTotals.rooms) * 100 : null,
      revenuePct:
        stlyTotals.revenue > 0 ? ((currentTotals.revenue - stlyTotals.revenue) / stlyTotals.revenue) * 100 : null,
    },
    pickup: {
      last7: { rooms: 28, revenue: 5320 },
      last14: { rooms: 54, revenue: 10260 },
      last30: { rooms: 98, revenue: 18620 },
    },
    byMonth,
    curve,
  }
}

interface PaceTotalsMock {
  rooms: number
  revenue: number
  adr: number
}

/** ---------------- Rate Shopper (/api/accelerator/rate-shopper) ---------------- */
const DEMO_COMPETITORS = [
  { id: "comp-1", name: "Grand Hotel Riviera", external_ref: "google:0x1", provider: "manual", channel: "booking_com", active: true, created_at: "2026-01-10T00:00:00Z" },
  { id: "comp-2", name: "Hotel Belvedere", external_ref: "google:0x2", provider: "manual", channel: "booking_com", active: true, created_at: "2026-01-12T00:00:00Z" },
  { id: "comp-3", name: "Residenza del Mare", external_ref: "google:0x3", provider: "manual", channel: "booking_com", active: true, created_at: "2026-01-15T00:00:00Z" },
  { id: "comp-4", name: "Palazzo Centrale", external_ref: "google:0x4", provider: "manual", channel: "booking_com", active: true, created_at: "2026-01-18T00:00:00Z" },
]

function buildRateShopperCompetitors() {
  return { competitors: DEMO_COMPETITORS }
}

function buildRateShopperFreshness() {
  // stale:false -> la pagina demo non lancia il pull automatico (POST /refresh).
  return { stale: false, lastPulledAt: new Date(Date.now() - 6 * 3_600_000).toISOString() }
}

/** Prezzo "nostro" e dei competitor per una data, deterministico. */
function shopperDayPrices(date: string, occupancy: number, salt: number) {
  const d = new Date(date + "T00:00:00")
  const dow = d.getDay()
  const weekend = dow === 5 || dow === 6 ? 1.18 : 1
  const month = d.getMonth()
  const seasonal = month >= 5 && month <= 8 ? 1.25 : month >= 3 && month <= 9 ? 1.05 : 0.85
  const occFactor = 1 + (occupancy - 2) * 0.12
  const seed = Number(date.replace(/-/g, "")) + salt
  const r = rng(seed)
  const base = 175 * weekend * seasonal * occFactor
  const our = Math.round(base * (0.96 + r() * 0.06))
  const compPrices = DEMO_COMPETITORS.map((c, i) => {
    const cr = rng(seed + (i + 1) * 7)
    // Il mercato sta mediamente leggermente sopra di noi (siamo competitivi).
    return Math.round(base * (1.0 + cr() * 0.22))
  })
  return { our, compPrices }
}

function buildRateShopper(params: URLSearchParams) {
  const today = new Date()
  const from = params.get("from") || today.toISOString().slice(0, 10)
  const to = params.get("to") || new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10)
  const occupancy = Number(params.get("occupancy")) || 2
  const dates = eachDate(from, to, 95)

  const competitors = DEMO_COMPETITORS.map((c) => ({ id: c.id, name: c.name }))
  let diffSum = 0
  let diffCount = 0
  let daysCheaper = 0
  let daysPricier = 0

  const days = dates.map((date) => {
    const { our, compPrices } = shopperDayPrices(date, occupancy, 0)
    const cells = DEMO_COMPETITORS.map((c, i) => ({
      competitorId: c.id,
      name: c.name,
      price: compPrices[i],
      availability: true,
    }))
    const mkt = compPrices
    const med = median(mkt)
    const diffVsMedianPct = med != null && med > 0 ? ((our - med) / med) * 100 : null
    if (diffVsMedianPct != null) {
      diffSum += diffVsMedianPct
      diffCount++
      if (diffVsMedianPct < 0) daysCheaper++
      else if (diffVsMedianPct > 0) daysPricier++
    }
    const ranked = [our, ...mkt].sort((a, b) => a - b)
    const rank = ranked.indexOf(our) + 1
    return {
      date,
      ourPrice: our,
      competitors: cells,
      market: { min: Math.min(...mkt), median: med, max: Math.max(...mkt), count: mkt.length },
      diffVsMedianPct,
      rank,
      rankOf: mkt.length + 1,
    }
  })

  return {
    range: { from, to, occupancy },
    competitors,
    days,
    summary: {
      daysCompared: days.length,
      avgDiffVsMedianPct: diffCount > 0 ? diffSum / diffCount : null,
      daysCheaper,
      daysPricier,
    },
  }
}

function buildRateShopperByRoom(params: URLSearchParams) {
  const today = new Date()
  const from = params.get("from") || today.toISOString().slice(0, 10)
  const to = params.get("to") || new Date(today.getTime() + 60 * 86400000).toISOString().slice(0, 10)
  const occupancy = Number(params.get("occupancy")) || 2
  const dates = eachDate(from, to, 95)
  const competitors = DEMO_COMPETITORS.map((c) => ({ id: c.id, name: c.name }))

  const roomTypes = DEMO_ROOM_TYPES.map((rt, rtIdx) => {
    const tierFactor = rtIdx === 0 ? 1 : rtIdx === 1 ? 1.3 : 1.7
    let diffSum = 0
    let diffCount = 0
    const days = dates.map((date) => {
      const { our, compPrices } = shopperDayPrices(date, occupancy, (rtIdx + 1) * 1000)
      const ourPrice = Math.round(our * tierFactor)
      const cells = DEMO_COMPETITORS.map((c, i) => ({
        competitorId: c.id,
        name: c.name,
        // L'ultimo competitor non ha la tipologia associata (mostra "n/d").
        mappedRoom: i === DEMO_COMPETITORS.length - 1 ? null : `${rt.name} equivalente`,
        price: i === DEMO_COMPETITORS.length - 1 ? null : Math.round(compPrices[i] * tierFactor),
      }))
      const mkt = cells.filter((c) => c.price != null).map((c) => c.price as number)
      const med = median(mkt)
      const diffVsMedianPct = med != null && med > 0 ? ((ourPrice - med) / med) * 100 : null
      if (diffVsMedianPct != null) {
        diffSum += diffVsMedianPct
        diffCount++
      }
      return {
        date,
        ourPrice,
        competitors: cells,
        market: { min: mkt.length ? Math.min(...mkt) : null, median: med, max: mkt.length ? Math.max(...mkt) : null, count: mkt.length },
        diffVsMedianPct,
      }
    })
    return {
      roomTypeId: rt.id,
      roomTypeName: rt.name,
      days,
      summary: {
        daysCompared: days.length,
        avgDiffVsMedianPct: diffCount > 0 ? diffSum / diffCount : null,
        mapped: DEMO_COMPETITORS.length - 1,
        competitorsTotal: DEMO_COMPETITORS.length,
      },
    }
  })

  return { range: { from, to, occupancy }, competitors, roomTypes }
}

function buildRateShopperMonitoredRooms() {
  return {
    max: 3,
    monitored: DEMO_ROOM_TYPES.map((rt) => rt.id),
    roomTypes: DEMO_ROOM_TYPES.map((rt) => ({
      id: rt.id,
      name: rt.name,
      capacity: rt.id === "rt-suite" ? 4 : rt.id === "rt-deluxe" ? 3 : 2,
      max_occupancy: rt.id === "rt-suite" ? 4 : rt.id === "rt-deluxe" ? 3 : 2,
    })),
  }
}

function buildRateShopperRoomMap() {
  const observed = DEMO_COMPETITORS.map((c, i) => ({
    competitorId: c.id,
    name: c.name,
    status: i === DEMO_COMPETITORS.length - 1 ? ("no_rooms" as const) : ("ok" as const),
    rooms:
      i === DEMO_COMPETITORS.length - 1
        ? []
        : ROOM_TYPE_NAMES.map((rn, j) => ({
            name: `${rn} equivalente`,
            numGuests: 2,
            lastPrice: 160 + i * 12 + j * 40,
          })),
  }))
  const mappings: Array<{ roomTypeId: string; competitorId: string; competitorRoomName: string }> = []
  DEMO_ROOM_TYPES.forEach((rt, rtIdx) => {
    DEMO_COMPETITORS.slice(0, -1).forEach((c) => {
      mappings.push({
        roomTypeId: rt.id,
        competitorId: c.id,
        competitorRoomName: `${ROOM_TYPE_NAMES[rtIdx] ?? rt.name} equivalente`,
      })
    })
  })
  return { observed, mappings }
}

/** ---------------- Registry ---------------- */
interface MockRoute {
  test: (pathname: string) => boolean
  build: (params: URLSearchParams, pathname: string) => unknown
}

const ROUTES: MockRoute[] = [
  { test: (p) => p === "/api/dati/calendario", build: (params) => buildCalendario(params) },
  { test: (p) => p === "/api/ota/stats", build: () => buildOtaStats() },
  // Recensioni
  { test: (p) => p === "/api/reviews/list", build: (params) => buildReviewsList(params) },
  { test: (p) => p === "/api/reviews/stats", build: () => buildReviewsStats() },
  { test: (p) => p === "/api/reviews/insights", build: () => buildReviewsInsights() },
  { test: (p) => p === "/api/integrations/reviews/dormant-channels", build: () => ({ dormantChannels: [] }) },
  // Analytics
  { test: (p) => p === "/api/dati/analytics", build: (params) => buildAnalytics(params) },
  // Dashboard overview
  { test: (p) => p === "/api/dashboard/availability", build: () => buildDashboardAvailability() },
  { test: (p) => p === "/api/dashboard/production", build: () => buildDashboardProduction() },
  { test: (p) => p === "/api/dashboard/kpi-configs", build: () => ({ configs: [] }) },
  // Accelerator data-driven (pagine reali montate in demo)
  { test: (p) => p === "/api/dati/objectives", build: (params) => buildObjectives(params) },
  { test: (p) => p === "/api/dati/rooms-sold", build: (params) => buildRoomsSold(params) },
  { test: (p) => p === "/api/dati/production", build: (params) => buildDatiProduction(params) },
  { test: (p) => p === "/api/pms/last-sync", build: () => buildLastSync() },
  { test: (p) => p === "/api/accelerator/channel-production", build: (params) => buildChannelProduction(params) },
  { test: (p) => p === "/api/superadmin/pricing-log", build: (params) => buildPricingLog(params) },
  { test: (p) => p === "/api/superadmin/pricing-log/coverage", build: () => ({ reports: [] }) },
  // Guard
  { test: (p) => p === "/api/guard/config", build: () => buildGuardConfig() },
  { test: (p) => p === "/api/guard/check", build: (params) => buildGuardChecks(params) },
  { test: (p) => p === "/api/rates", build: () => buildRates() },
  // Pricing (griglia AI reale)
  { test: (p) => p === "/api/accelerator/pricing-grid", build: (params) => buildPricingGrid(params) },
  { test: (p) => p === "/api/accelerator/subscription", build: () => buildPricingSubscription() },
  { test: (p) => p === "/api/settings/rate-limits", build: () => buildRateLimits() },
  { test: (p) => p === "/api/settings/pricing-variables", build: () => buildPricingVariables() },
  { test: (p) => p === "/api/accelerator/weather", build: () => buildWeather() },
  { test: (p) => p === "/api/accelerator/events", build: (params) => buildEvents(params) },
  // Trend Tariffe & Occupazione
  { test: (p) => p === "/api/accelerator/rate-trend", build: (params) => buildRateTrend(params) },
  { test: (p) => p === "/api/accelerator/rate-trend/occupancy-pickup", build: (params) => buildOccupancyPickup(params) },
  { test: (p) => p === "/api/autopilot/config", build: () => buildAutopilotConfig() },
  { test: (p) => p === "/api/accelerator/rates-list", build: () => buildRatesList() },
  // Booking Pace
  { test: (p) => p === "/api/accelerator/pace", build: (params) => buildPace(params) },
  // Rate Shopper
  { test: (p) => p === "/api/accelerator/rate-shopper", build: (params) => buildRateShopper(params) },
  { test: (p) => p === "/api/accelerator/rate-shopper/by-room", build: (params) => buildRateShopperByRoom(params) },
  { test: (p) => p === "/api/accelerator/rate-shopper/competitors", build: () => buildRateShopperCompetitors() },
  { test: (p) => p === "/api/accelerator/rate-shopper/freshness", build: () => buildRateShopperFreshness() },
  { test: (p) => p === "/api/accelerator/rate-shopper/monitored-rooms", build: () => buildRateShopperMonitoredRooms() },
  { test: (p) => p === "/api/accelerator/rate-shopper/room-map", build: () => buildRateShopperRoomMap() },
  // Insight AI (report finto pre-generato)
  { test: (p) => p.startsWith("/api/ai-report/history/"), build: (_params, pathname) => buildAiReportDetail(pathname) },
  { test: (p) => p === "/api/ai-report/history", build: () => buildAiReportHistory() },
  // Area Revenue Manager (chat / note / attivita / file finti)
  { test: (p) => p === "/api/revman/notes", build: () => buildRevmanNotes() },
  { test: (p) => p === "/api/revman/activities", build: () => buildRevmanActivities() },
  { test: (p) => p === "/api/revman/files", build: () => buildRevmanFiles() },
  { test: (p) => p === "/api/ai-chat/sessions", build: () => buildAiChatSessions() },
  { test: (p) => p === "/api/superadmin/revman-sales-access", build: () => ({ grants: [] }) },
  { test: (p) => p === "/api/superadmin/sales-agents", build: () => ({ agents: [] }) },
  // Endpoint comuni di contesto
  {
    test: (p) => p === "/api/ui/selected-hotel",
    build: () => ({ hotelId: DEMO_HOTEL_ID, hotel: { id: DEMO_HOTEL_ID, name: DEMO_HOTEL.name } }),
  },
  {
    test: (p) => p === "/api/ui/me",
    build: () => ({ isSuperAdmin: false, role: "property_admin", user: { id: "demo-user", role: "property_admin" } }),
  },
  {
    test: (p) => p === "/api/auth/me",
    build: () => ({ is_superadmin: false, role: "property_admin", user: { id: "demo-user", role: "property_admin" } }),
  },
  { test: (p) => p === "/api/internal/user-role", build: () => ({ role: "hotel", isSuperAdmin: false }) },
]

/**
 * Ritorna il payload mock per una URL, oppure `undefined` se non gestita
 * (in tal caso l'interceptor lascia passare la fetch originale).
 */
export function getDemoMock(url: string): unknown | undefined {
  let pathname = url
  let search = ""
  try {
    const u = new URL(url, "http://localhost")
    pathname = u.pathname
    search = u.search
  } catch {
    const qIdx = url.indexOf("?")
    if (qIdx >= 0) {
      pathname = url.slice(0, qIdx)
      search = url.slice(qIdx)
    }
  }
  const route = ROUTES.find((r) => r.test(pathname))
  if (!route) return undefined
  return route.build(new URLSearchParams(search), pathname)
}
