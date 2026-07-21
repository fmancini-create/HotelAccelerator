import { addDays, daysBetween, type PaceBooking } from "@/lib/pace/compute"

// ---------------------------------------------------------------------------
// Bilancio commerciale (commercial balance)
// ---------------------------------------------------------------------------
// Logica PURA (niente I/O) per la pagina /accelerator/commercial-balance.
// Costruisce, giorno per giorno sull'asse DATA-PRENOTAZIONE:
//   - prenotazioni RICEVUTE (create quel giorno)
//   - prenotazioni CANCELLATE (annullate quel giorno)
//   - SALDO netto = ricevute - cancellate
// per tre metriche: numero prenotazioni, produzione netta in EUR, room-nights.
//
// In piu' una VALUTAZIONE del raggiungimento obiettivi che lega i due assi
// temporali diversi (la prenotazione arriva oggi, il soggiorno e' nel futuro):
//   - obiettivo EUR per mese di soggiorno (revenue_objectives)
//   - OTB gia' acquisito per quel mese
//   - gap EUR -> /ADR -> gap notti -> /LOS -> gap prenotazioni
//   - finestra di raccolta = da oggi a FINE mese di soggiorno
//   - ritmo netto RICHIESTO/giorno vs ritmo netto ATTUALE (media mobile)
//
// NB DATI-CERTI: la produzione e' la produzione NETTA camera (net_price, con
// fallback total_price - extras), coerente con la pagina Obiettivi. Le
// cancellazioni per-giorno sono affidabili solo se il PMS data le cancellazioni
// (Scidoo si, BRiG no -> il chiamante segnala l'inaffidabilita').

/** Ricavo NETTO camera totale di una prenotazione (tutte le notti, tutte le camere). */
export function bookingRoomRevenue(b: PaceBooking): number {
  const v =
    b.net_price != null
      ? Number(b.net_price)
      : b.total_price != null
        ? Number(b.total_price) - Number(b.extras_revenue ?? 0)
        : 0
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Notti soggiorno di una prenotazione (fallback: differenza date). */
export function bookingNights(b: PaceBooking): number {
  if (b.number_of_nights && b.number_of_nights > 0) return b.number_of_nights
  if (b.check_in_date && b.check_out_date) return Math.max(1, daysBetween(b.check_in_date, b.check_out_date))
  return 1
}

/** Numero camere di una prenotazione (default 1). */
export function bookingRooms(b: PaceBooking): number {
  return b.number_of_rooms && b.number_of_rooms > 0 ? b.number_of_rooms : 1
}

/** Room-nights totali della prenotazione (notti * camere). */
export function bookingRoomNights(b: PaceBooking): number {
  return bookingNights(b) * bookingRooms(b)
}

export interface DailyBalanceRow {
  date: string
  // ricevute
  receivedCount: number
  receivedEur: number
  receivedRoomNights: number
  receivedRevpor: number // RevPOR = produzione netta ricevuta / room-nights ricevute
  // cancellate
  cancelledCount: number
  cancelledEur: number
  cancelledRoomNights: number
  // saldo netto
  netCount: number
  netEur: number
  netRoomNights: number
  // valutazione (trend)
  trailingNetEurPerDay: number // media mobile del saldo EUR
  requiredEurPerDay: number // ritmo richiesto aggregato (costante, as-of oggi)
  paceRatio: number | null // trailingNetEurPerDay / requiredEurPerDay
  status: BalanceStatus
}

export type BalanceStatus = "on-track" | "at-risk" | "off-track" | "no-target"

export interface MonthTarget {
  month: string // YYYY-MM
  objectiveEur: number
  otbEur: number
  otbRoomNights: number
  adr: number
  gapEur: number
  gapRoomNights: number
  gapBookings: number
  daysWindow: number
  requiredEurPerDay: number
  requiredBookingsPerDay: number
  recentEurPerDay: number // ritmo netto recente verso QUESTO mese
  paceRatio: number | null
  status: BalanceStatus
}

export interface CommercialBalanceResult {
  range: { from: string; to: string; today: string }
  los: number
  leadTimeDays: number
  cancellationsDated: boolean
  totals: {
    receivedCount: number
    receivedEur: number
    receivedRoomNights: number
    cancelledCount: number
    cancelledEur: number
    cancelledRoomNights: number
    netCount: number
    netEur: number
    netRoomNights: number
    receivedRevpor: number // RevPOR medio delle prenotazioni entrate nel periodo
  }
  totalRequiredEurPerDay: number
  trailingNetEurPerDay: number // media ultimi 7 giorni di attivita'
  overallStatus: BalanceStatus
  daily: DailyBalanceRow[]
  months: MonthTarget[]
}

export interface ObjectiveInput {
  month: string // YYYY-MM
  objectiveEur: number
}

const TRAILING_WINDOW = 7

function endOfMonthISO(month: string): string {
  const [y, m] = month.split("-").map(Number)
  // giorno 0 del mese successivo = ultimo giorno del mese corrente
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

function monthOf(iso: string): string {
  return iso.slice(0, 7)
}

/** Frazione di NOTTI di una prenotazione che cade in un dato mese di soggiorno. */
function roomNightsInMonth(b: PaceBooking, month: string): number {
  if (!b.check_in_date || !b.check_out_date) return 0
  const rooms = bookingRooms(b)
  let count = 0
  for (let n = b.check_in_date; n < b.check_out_date; n = addDays(n, 1)) {
    if (monthOf(n) === month) count += 1
  }
  return count * rooms
}

/** Ricavo netto di una prenotazione attribuito alle notti che cadono in un mese. */
function revenueInMonth(b: PaceBooking, month: string): number {
  const totalNights = bookingNights(b)
  if (totalNights <= 0) return 0
  const perNight = bookingRoomRevenue(b) / totalNights
  let nights = 0
  if (b.check_in_date && b.check_out_date) {
    for (let n = b.check_in_date; n < b.check_out_date; n = addDays(n, 1)) {
      if (monthOf(n) === month) nights += 1
    }
  }
  return perNight * nights
}

function statusFromRatio(ratio: number | null): BalanceStatus {
  if (ratio == null) return "no-target"
  if (ratio >= 1) return "on-track"
  if (ratio >= 0.7) return "at-risk"
  return "off-track"
}

/**
 * Calcola il bilancio commerciale completo.
 * @param bookings tutte le prenotazioni della struttura (cancellate incluse)
 * @param objectives obiettivi EUR per mese di soggiorno (mese di check-in)
 * @param opts.today data odierna ISO
 * @param opts.from / opts.to intervallo della tabella giornaliera (asse booking_date)
 */
export function computeCommercialBalance(
  bookings: PaceBooking[],
  objectives: ObjectiveInput[],
  opts: { today: string; from: string; to: string },
): CommercialBalanceResult {
  const { today, from, to } = opts

  // --- LOS e lead time medi (prenotazioni non cancellate con date valide) ---
  let losSum = 0
  let losN = 0
  let leadSum = 0
  let leadN = 0
  // --- rilevazione affidabilita' cancellazioni (PMS che datano vs no) ---
  let cancelledTotal = 0
  let cancelledDated = 0

  for (const b of bookings) {
    if (!b.is_cancelled && b.check_in_date && b.check_out_date && b.check_out_date > b.check_in_date) {
      losSum += daysBetween(b.check_in_date, b.check_out_date)
      losN += 1
      if (b.booking_date && b.check_in_date >= b.booking_date) {
        leadSum += daysBetween(b.booking_date, b.check_in_date)
        leadN += 1
      }
    }
    if (b.is_cancelled) {
      cancelledTotal += 1
      if (b.cancellation_date) cancelledDated += 1
    }
  }
  const los = losN > 0 ? losSum / losN : 1
  const leadTimeDays = leadN > 0 ? leadSum / leadN : 0
  const cancellationsDated = cancelledTotal === 0 || cancelledDated > 0

  // --- mappe giornaliere ricevute/cancellate sull'asse booking/cancellation ---
  const received = new Map<string, { count: number; eur: number; rn: number }>()
  const cancelled = new Map<string, { count: number; eur: number; rn: number }>()
  for (const b of bookings) {
    const eur = bookingRoomRevenue(b)
    const rn = bookingRoomNights(b)
    if (b.booking_date) {
      const cell = received.get(b.booking_date) ?? { count: 0, eur: 0, rn: 0 }
      cell.count += 1
      cell.eur += eur
      cell.rn += rn
      received.set(b.booking_date, cell)
    }
    if (b.is_cancelled && b.cancellation_date) {
      const cell = cancelled.get(b.cancellation_date) ?? { count: 0, eur: 0, rn: 0 }
      cell.count += 1
      cell.eur += eur
      cell.rn += rn
      cancelled.set(b.cancellation_date, cell)
    }
  }

  // --- VALUTAZIONE OBIETTIVI: gap e ritmo richiesto per mese di soggiorno ---
  const objByMonth = new Map<string, number>(objectives.map((o) => [o.month, o.objectiveEur]))
  const todayMonth = monthOf(today)

  // OTB (produzione gia' acquisita) per mese: prenotazioni non cancellate, notti
  // che cadono nel mese, ricavo netto attribuito a quelle notti.
  const otbEurByMonth = new Map<string, number>()
  const otbRnByMonth = new Map<string, number>()
  for (const b of bookings) {
    if (b.is_cancelled) continue
    if (!b.booking_date || b.booking_date > today) continue
    if (!b.check_in_date || !b.check_out_date) continue
    // considera solo i mesi con obiettivo
    const startM = monthOf(b.check_in_date)
    const endM = monthOf(addDays(b.check_out_date, -1))
    for (const m of objByMonth.keys()) {
      if (m < startM || m > endM) continue
      otbEurByMonth.set(m, (otbEurByMonth.get(m) ?? 0) + revenueInMonth(b, m))
      otbRnByMonth.set(m, (otbRnByMonth.get(m) ?? 0) + roomNightsInMonth(b, m))
    }
  }

  // Ritmo netto RECENTE (ultimi 7 giorni) attribuito a ciascun mese di soggiorno.
  const recentFrom = addDays(today, -TRAILING_WINDOW)
  const recentEurByMonth = new Map<string, number>()
  for (const b of bookings) {
    if (!b.check_in_date || !b.check_out_date) continue
    const startM = monthOf(b.check_in_date)
    const endM = monthOf(addDays(b.check_out_date, -1))
    // ricevute negli ultimi 7 gg -> +
    if (b.booking_date && b.booking_date > recentFrom && b.booking_date <= today && !b.is_cancelled) {
      for (const m of objByMonth.keys()) {
        if (m < startM || m > endM) continue
        recentEurByMonth.set(m, (recentEurByMonth.get(m) ?? 0) + revenueInMonth(b, m))
      }
    }
    // cancellate negli ultimi 7 gg -> -
    if (b.is_cancelled && b.cancellation_date && b.cancellation_date > recentFrom && b.cancellation_date <= today) {
      for (const m of objByMonth.keys()) {
        if (m < startM || m > endM) continue
        recentEurByMonth.set(m, (recentEurByMonth.get(m) ?? 0) - revenueInMonth(b, m))
      }
    }
  }

  // ADR medio struttura (fallback per mesi senza OTB).
  const totOtbEur = [...otbEurByMonth.values()].reduce((a, v) => a + v, 0)
  const totOtbRn = [...otbRnByMonth.values()].reduce((a, v) => a + v, 0)
  const hotelAdr = totOtbRn > 0 ? totOtbEur / totOtbRn : 0

  const months: MonthTarget[] = []
  let totalRequiredEurPerDay = 0
  for (const [month, objectiveEur] of [...objByMonth.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // solo mesi ancora "aperti": il mese di soggiorno non e' gia' passato
    if (month < todayMonth) continue
    const otbEur = otbEurByMonth.get(month) ?? 0
    const otbRoomNights = otbRnByMonth.get(month) ?? 0
    const adr = otbRoomNights > 0 ? otbEur / otbRoomNights : hotelAdr
    const gapEur = Math.max(0, objectiveEur - otbEur)
    const gapRoomNights = adr > 0 ? gapEur / adr : 0
    const gapBookings = los > 0 ? gapRoomNights / los : 0
    const eom = endOfMonthISO(month)
    const daysWindow = Math.max(1, daysBetween(today, eom))
    const requiredEurPerDay = gapEur / daysWindow
    const requiredBookingsPerDay = gapBookings / daysWindow
    const recentEurPerDay = (recentEurByMonth.get(month) ?? 0) / TRAILING_WINDOW
    const paceRatio = requiredEurPerDay > 0 ? recentEurPerDay / requiredEurPerDay : gapEur <= 0 ? 1 : null
    const status: BalanceStatus = gapEur <= 0 ? "on-track" : statusFromRatio(paceRatio)
    totalRequiredEurPerDay += requiredEurPerDay
    months.push({
      month,
      objectiveEur,
      otbEur,
      otbRoomNights,
      adr,
      gapEur,
      gapRoomNights,
      gapBookings,
      daysWindow,
      requiredEurPerDay,
      requiredBookingsPerDay,
      recentEurPerDay,
      paceRatio,
      status,
    })
  }

  // --- righe giornaliere nell'intervallo richiesto + media mobile saldo EUR ---
  // Per la media mobile costruiamo prima la serie netta giornaliera completa
  // (anche prima di `from`, cosi' la finestra trailing al bordo sinistro e'
  // corretta). Poi tagliamo a [from, to].
  const seriesFrom = addDays(from, -(TRAILING_WINDOW - 1))
  const netEurByDay = new Map<string, number>()
  for (let d = seriesFrom; d <= to; d = addDays(d, 1)) {
    const r = received.get(d)
    const c = cancelled.get(d)
    netEurByDay.set(d, (r?.eur ?? 0) - (c?.eur ?? 0))
  }

  const daily: DailyBalanceRow[] = []
  const totals = {
    receivedCount: 0,
    receivedEur: 0,
    receivedRoomNights: 0,
    cancelledCount: 0,
    cancelledEur: 0,
    cancelledRoomNights: 0,
    netCount: 0,
    netEur: 0,
    netRoomNights: 0,
    receivedRevpor: 0,
  }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = received.get(d) ?? { count: 0, eur: 0, rn: 0 }
    const c = cancelled.get(d) ?? { count: 0, eur: 0, rn: 0 }
    const netCount = r.count - c.count
    const netEur = r.eur - c.eur
    const netRoomNights = r.rn - c.rn
    // media mobile saldo EUR sugli ultimi TRAILING_WINDOW giorni (incluso d)
    let sum = 0
    for (let k = 0; k < TRAILING_WINDOW; k++) sum += netEurByDay.get(addDays(d, -k)) ?? 0
    const trailingNetEurPerDay = sum / TRAILING_WINDOW
    const paceRatio =
      totalRequiredEurPerDay > 0 ? trailingNetEurPerDay / totalRequiredEurPerDay : null
    const status: BalanceStatus =
      totalRequiredEurPerDay <= 0 ? "no-target" : statusFromRatio(paceRatio)
    daily.push({
      date: d,
      receivedCount: r.count,
      receivedEur: Math.round(r.eur),
      receivedRoomNights: r.rn,
      receivedRevpor: r.rn > 0 ? Math.round(r.eur / r.rn) : 0,
      cancelledCount: c.count,
      cancelledEur: Math.round(c.eur),
      cancelledRoomNights: c.rn,
      netCount,
      netEur: Math.round(netEur),
      netRoomNights,
      trailingNetEurPerDay: Math.round(trailingNetEurPerDay),
      requiredEurPerDay: Math.round(totalRequiredEurPerDay),
      paceRatio,
      status,
    })
    totals.receivedCount += r.count
    totals.receivedEur += r.eur
    totals.receivedRoomNights += r.rn
    totals.cancelledCount += c.count
    totals.cancelledEur += c.eur
    totals.cancelledRoomNights += c.rn
  }
  totals.receivedEur = Math.round(totals.receivedEur)
  totals.cancelledEur = Math.round(totals.cancelledEur)
  totals.netCount = totals.receivedCount - totals.cancelledCount
  totals.netEur = totals.receivedEur - totals.cancelledEur
  totals.netRoomNights = totals.receivedRoomNights - totals.cancelledRoomNights
  // RevPOR medio del periodo = produzione ricevuta / room-nights ricevute
  totals.receivedRevpor = totals.receivedRoomNights > 0 ? Math.round(totals.receivedEur / totals.receivedRoomNights) : 0

  // headline: media saldo EUR/giorno ultimi 7 gg fino a oggi
  let recentSum = 0
  for (let k = 0; k < TRAILING_WINDOW; k++) recentSum += netEurByDay.get(addDays(today, -k)) ?? 0
  const trailingNetEurPerDay = Math.round(recentSum / TRAILING_WINDOW)
  const overallRatio =
    totalRequiredEurPerDay > 0 ? trailingNetEurPerDay / totalRequiredEurPerDay : null
  const overallStatus: BalanceStatus =
    totalRequiredEurPerDay <= 0 ? "no-target" : statusFromRatio(overallRatio)

  return {
    range: { from, to, today },
    los: Math.round(los * 100) / 100,
    leadTimeDays: Math.round(leadTimeDays * 10) / 10,
    cancellationsDated,
    totals,
    totalRequiredEurPerDay: Math.round(totalRequiredEurPerDay),
    trailingNetEurPerDay,
    overallStatus,
    daily,
    months,
  }
}
