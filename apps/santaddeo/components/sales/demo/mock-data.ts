/**
 * Mock data condivisi tra le pagine demo. Tutto statico, niente DB.
 */

export const DEMO_HOTEL = {
  name: "Hotel Santaddeo",
  city: "Roma",
  rooms: 32,
  stars: 4,
}

export const DEMO_KPI = {
  occupancy: 78,
  adr: 142.5,
  revpar: 111.15,
  revenue_month: 184320,
  pickup_7d: 47,
  cancellation_rate: 6.8,
}

export const DEMO_BOOKINGS = [
  { id: "B-10421", guest: "Mario Rossi", channel: "Booking.com", checkin: "2026-06-02", checkout: "2026-06-05", room: "Suite 204", amount: 642, status: "confirmed" },
  { id: "B-10422", guest: "Laura Bianchi", channel: "Direct", checkin: "2026-06-03", checkout: "2026-06-06", room: "Deluxe 312", amount: 489, status: "confirmed" },
  { id: "B-10423", guest: "James Smith", channel: "Expedia", checkin: "2026-06-03", checkout: "2026-06-04", room: "Standard 105", amount: 168, status: "confirmed" },
  { id: "B-10424", guest: "Sophie Martin", channel: "Airbnb", checkin: "2026-06-05", checkout: "2026-06-09", room: "Suite 204", amount: 856, status: "pending" },
  { id: "B-10425", guest: "Hans Mueller", channel: "Booking.com", checkin: "2026-06-06", checkout: "2026-06-08", room: "Deluxe 310", amount: 322, status: "confirmed" },
  { id: "B-10426", guest: "Yuki Tanaka", channel: "Direct", checkin: "2026-06-07", checkout: "2026-06-10", room: "Standard 102", amount: 411, status: "confirmed" },
  { id: "B-10427", guest: "Anna Kowalski", channel: "Hotelbeds", checkin: "2026-06-08", checkout: "2026-06-11", room: "Deluxe 312", amount: 498, status: "confirmed" },
  { id: "B-10428", guest: "Pietro Verdi", channel: "Direct", checkin: "2026-06-10", checkout: "2026-06-13", room: "Suite 204", amount: 712, status: "confirmed" },
]

export const DEMO_REVIEWS = [
  { source: "Booking.com", author: "Marco F.", rating: 9.2, date: "2026-05-21", text: "Posizione ottima, staff disponibilissimo. Colazione sopra la media." },
  { source: "Google", author: "Elena R.", rating: 5.0, date: "2026-05-19", text: "Esperienza impeccabile. La camera con vista era esattamente come nelle foto." },
  { source: "TripAdvisor", author: "John D.", rating: 4.0, date: "2026-05-17", text: "Hotel grazioso, l'unico neo il rumore della strada nelle camere lato nord." },
  { source: "Booking.com", author: "Claire P.", rating: 8.7, date: "2026-05-15", text: "Excellent value for money. Will come back next year." },
  { source: "Expedia", author: "Tomas L.", rating: 4.5, date: "2026-05-12", text: "Camera spaziosa e pulitissima, check-in rapido." },
]

export const DEMO_ROOM_TYPES = [
  { code: "STD", name: "Standard", count: 14, base_price: 120 },
  { code: "DLX", name: "Deluxe", count: 12, base_price: 165 },
  { code: "STE", name: "Suite", count: 6, base_price: 245 },
]

export const DEMO_OTAS = [
  { name: "Booking.com", commission: 15, share: 42, color: "#003580", connected: true },
  { name: "Expedia", commission: 18, share: 14, color: "#FFC72C", connected: true },
  { name: "Airbnb", commission: 14, share: 9, color: "#FF5A5F", connected: true },
  { name: "Hotelbeds", commission: 22, share: 5, color: "#1E88E5", connected: true },
  { name: "Direct", commission: 0, share: 30, color: "#10B981", connected: true },
]

/**
 * Produzione (ricavi per giorno e tipologia camera) - clone di
 * /dati/production. Mese: Maggio 2026. Tre tipologie come DEMO_ROOM_TYPES.
 */
export const DEMO_PRODUCTION_ROOM_TYPES = [
  { code: "STD", name: "Standard" },
  { code: "DLX", name: "Deluxe" },
  { code: "STE", name: "Suite" },
]

export const DEMO_PRODUCTION_DAYS = (() => {
  // Genera 31 giorni di Maggio 2026 con ricavi pseudo-realistici per tipologia.
  const occBase = [62, 68, 71, 74, 80, 88, 90, 78, 70, 73, 79, 85, 92, 95, 86, 77, 72, 76, 83, 90, 96, 98, 88, 79, 74, 78, 84, 91, 97, 93, 82]
  return Array.from({ length: 31 }, (_, i) => {
    const day = i + 1
    const occ = occBase[i] ?? 75
    const factor = occ / 100
    const std = Math.round(120 * 14 * factor * 0.55)
    const dlx = Math.round(165 * 12 * factor * 0.6)
    const ste = Math.round(245 * 6 * factor * 0.65)
    return {
      date: `2026-05-${String(day).padStart(2, "0")}`,
      revenues: { STD: std, DLX: dlx, STE: ste } as Record<string, number>,
      total: std + dlx + ste,
    }
  })
})()

/**
 * Commissioni mensili - clone di /dati/commissioni-fatture (tab Commissioni).
 * Piano a commissione 5% sul delta YoY positivo. Anno 2026.
 */
export const DEMO_COMMISSION_YEAR = 2026
export const DEMO_COMMISSION_PERCENTAGE = 5

export const DEMO_COMMISSIONS = (() => {
  const labels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
  const current = [98000, 104000, 132000, 158000, 184320, 0, 0, 0, 0, 0, 0, 0]
  const prev = [88000, 96000, 121000, 142000, 168000, 196000, 231000, 248000, 178000, 138000, 99000, 121000]
  return labels.map((label, i) => {
    const cur = current[i]
    const pre = prev[i]
    const delta = cur - pre
    const positive = cur > 0 && delta > 0
    const commission = positive ? Math.round((delta * DEMO_COMMISSION_PERCENTAGE) / 100) : 0
    return {
      month: i + 1,
      label,
      currentRevenue: cur,
      prevRevenue: pre,
      deltaYoy: delta,
      deltaYoyPct: pre > 0 && cur > 0 ? (delta / pre) * 100 : null,
      commission,
      invoice:
        i < 4
          ? { number: `2026-${String(i + 1).padStart(3, "0")}`, status: i < 3 ? "paid" : "sent" }
          : null,
    }
  })
})()

/**
 * Fatture - clone tab "Fatture" di /dati/commissioni-fatture.
 */
export const DEMO_INVOICES = [
  { id: "inv-1", number: "2026-001", issue_date: "2026-02-05", period: "Gennaio 2026", subtotal: 500, tax: 110, total: 610, status: "paid", paid_at: "2026-02-12" },
  { id: "inv-2", number: "2026-002", issue_date: "2026-03-05", period: "Febbraio 2026", subtotal: 400, tax: 88, total: 488, status: "paid", paid_at: "2026-03-10" },
  { id: "inv-3", number: "2026-003", issue_date: "2026-04-05", period: "Marzo 2026", subtotal: 550, tax: 121, total: 671, status: "paid", paid_at: "2026-04-14" },
  { id: "inv-4", number: "2026-004", issue_date: "2026-05-05", period: "Aprile 2026", subtotal: 800, tax: 176, total: 976, status: "sent", paid_at: null },
]

export const DEMO_PRICING_GRID = [
  { date: "2026-06-01", std: 119, dlx: 165, ste: 245, occupancy: 65 },
  { date: "2026-06-02", std: 125, dlx: 172, ste: 252, occupancy: 71 },
  { date: "2026-06-03", std: 132, dlx: 178, ste: 261, occupancy: 78 },
  { date: "2026-06-04", std: 145, dlx: 195, ste: 285, occupancy: 86 },
  { date: "2026-06-05", std: 168, dlx: 222, ste: 318, occupancy: 94 },
  { date: "2026-06-06", std: 175, dlx: 232, ste: 332, occupancy: 96 },
  { date: "2026-06-07", std: 158, dlx: 210, ste: 305, occupancy: 89 },
  { date: "2026-06-08", std: 138, dlx: 188, ste: 272, occupancy: 80 },
  { date: "2026-06-09", std: 128, dlx: 175, ste: 258, occupancy: 73 },
  { date: "2026-06-10", std: 142, dlx: 192, ste: 281, occupancy: 84 },
  { date: "2026-06-11", std: 162, dlx: 215, ste: 312, occupancy: 91 },
  { date: "2026-06-12", std: 178, dlx: 235, ste: 338, occupancy: 97 },
  { date: "2026-06-13", std: 182, dlx: 240, ste: 345, occupancy: 98 },
  { date: "2026-06-14", std: 152, dlx: 205, ste: 298, occupancy: 87 },
]
