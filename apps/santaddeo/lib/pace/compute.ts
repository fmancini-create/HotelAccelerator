import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import type { SupabaseClient } from "@supabase/supabase-js"

// Motore del Booking Pace / Pickup.
// Ricostruisce l'on-the-books (OTB) "as-of" una certa data a partire dalla
// tabella normalizzata `bookings` (cross-PMS). Usato da:
//  - API /api/accelerator/pace (current, STLY, pickup, curva)
//  - cron pace-snapshot (persistenza giornaliera esatta)
//  - bridge K (segnale di domanda per il motore prezzi)

export interface PaceBooking {
  booking_date: string | null
  check_in_date: string | null
  check_out_date: string | null
  is_cancelled: boolean | null
  cancellation_date: string | null
  number_of_rooms: number | null
  number_of_nights: number | null
  total_price: number | null
  net_price: number | null
  extras_revenue: number | null
}

export interface OtbCell {
  rooms: number
  revenue: number
}

const DAY = 86400000

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(new Date(iso + "T00:00:00Z").getTime() + days * DAY))
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(bIso + "T00:00:00Z") - Date.parse(aIso + "T00:00:00Z")) / DAY)
}

/** ricavo camera per notte di una prenotazione (esclude gli extra) */
function roomRevenuePerNight(b: PaceBooking): number {
  const nights = b.number_of_nights && b.number_of_nights > 0 ? b.number_of_nights : 1
  // net_price (solo camera, affidabile per Scidoo) -> fallback total - extras -> total
  const roomTotal =
    b.net_price != null
      ? Number(b.net_price)
      : b.total_price != null
        ? Number(b.total_price) - Number(b.extras_revenue ?? 0)
        : 0
  if (!Number.isFinite(roomTotal) || roomTotal <= 0) return 0
  return roomTotal / nights
}

/**
 * Carica (paginato) tutte le prenotazioni della struttura che intersecano la
 * finestra di notti [nightFrom, nightTo). Non filtra le cancellate: servono i
 * loro campi per ricostruire l'OTB a una data passata.
 */
export async function fetchPaceBookings(
  supabase: SupabaseClient,
  hotelId: string,
  nightFrom: string,
  nightTo: string,
): Promise<PaceBooking[]> {
  return fetchAllPaginatedOrLog<PaceBooking>(
    () =>
      supabase
        .from("bookings")
        .select(
          "booking_date, check_in_date, check_out_date, is_cancelled, cancellation_date, number_of_rooms, number_of_nights, total_price, net_price, extras_revenue",
        )
        .eq("hotel_id", hotelId)
        .lt("check_in_date", nightTo)
        .gt("check_out_date", nightFrom)
        .order("check_in_date", { ascending: true }),
    "pace-bookings",
  )
}

/**
 * Una prenotazione e' "on the books" alla data `asOf` se:
 *  - e' gia' stata creata (booking_date <= asOf), e
 *  - NON e' cancellata (in nessun momento).
 *
 * IMPORTANTE — perche' escludiamo TUTTE le cancellate e non solo quelle
 * annullate entro `asOf`:
 * In origine contavamo una cancellata se `cancellation_date > asOf` (cioe' "era
 * a libro in quel momento, anche se annullata dopo"). Sembra corretto come
 * fotografia storica, ma falsa il confronto STLY: l'anno scorso e' MATURO e ha
 * accumulato tutte le cancellazioni successive ad `asOf`, mentre l'anno corrente
 * non le ha ancora ricevute. Risultato: lo STLY veniva gonfiato (es. Barronci
 * luglio 2025: 700 room-night calcolate contro 410 reali di Scidoo, perche'
 * 38 prenotazioni create entro il 3/6 furono annullate dopo). Escludere tutte
 * le cancellate allinea Pace al consuntivo Scidoo e alla pagina Obiettivi
 * (che gia' escludono le annullate). Verificato 03/06/2026.
 */
function isOnBooksAsOf(b: PaceBooking, asOf: string): boolean {
  if (!b.booking_date || b.booking_date > asOf) return false
  if (b.is_cancelled) return false
  return true
}

/**
 * Calcola l'OTB per ogni notte in [nightFrom, nightTo) alla data `asOf`.
 * Ritorna una mappa stay_date -> { rooms, revenue }.
 */
export function computeOtb(
  bookings: PaceBooking[],
  asOf: string,
  nightFrom: string,
  nightTo: string,
): Map<string, OtbCell> {
  const out = new Map<string, OtbCell>()
  for (const b of bookings) {
    if (!isOnBooksAsOf(b, asOf)) continue
    if (!b.check_in_date || !b.check_out_date) continue
    const rooms = b.number_of_rooms && b.number_of_rooms > 0 ? b.number_of_rooms : 1
    const revPerNight = roomRevenuePerNight(b) * rooms
    // itera le notti della prenotazione che cadono nella finestra
    const start = b.check_in_date < nightFrom ? nightFrom : b.check_in_date
    const end = b.check_out_date > nightTo ? nightTo : b.check_out_date
    for (let n = start; n < end; n = addDays(n, 1)) {
      const cell = out.get(n) ?? { rooms: 0, revenue: 0 }
      cell.rooms += rooms
      cell.revenue += revPerNight
      out.set(n, cell)
    }
  }
  return out
}

/** somma una mappa OTB in un singolo totale */
export function sumOtb(map: Map<string, OtbCell>): OtbCell {
  let rooms = 0
  let revenue = 0
  for (const c of map.values()) {
    rooms += c.rooms
    revenue += c.revenue
  }
  return { rooms, revenue }
}

export interface NightOtb {
  stayDate: string
  roomsOtb: number
  revenueOtb: number
}

/**
 * Convenience: carica le prenotazioni e calcola l'OTB per notte alla data
 * `asOf`. Usato dal cron pace-snapshot per persistere lo stato esatto del
 * giorno. Ritorna solo le notti con almeno una camera prenotata.
 */
export async function computeOnTheBooksByNight(
  supabase: SupabaseClient,
  params: { hotelId: string; asOf: string; nightFrom: string; nightTo: string },
): Promise<NightOtb[]> {
  const { hotelId, asOf, nightFrom, nightTo } = params
  const bookings = await fetchPaceBookings(supabase, hotelId, nightFrom, addDays(nightTo, 1))
  const map = computeOtb(bookings, asOf, nightFrom, addDays(nightTo, 1))
  const out: NightOtb[] = []
  for (const [stayDate, cell] of map) {
    out.push({ stayDate, roomsOtb: cell.rooms, revenueOtb: Math.round(cell.revenue * 100) / 100 })
  }
  out.sort((a, b) => (a.stayDate < b.stayDate ? -1 : 1))
  return out
}

/**
 * Bridge K: rapporto di pace per una singola notte (camere OTB oggi vs stesso
 * momento dell'anno scorso, cioe' stesso lead time). Ritorna null se non c'e'
 * abbastanza storico per un confronto significativo. Basato sulle CAMERE, non
 * sul conteggio righe, quindi piu' accurato del segnale K precedente.
 */
export async function computePaceRatioForNight(
  supabase: SupabaseClient,
  params: { hotelId: string; stayDate: string; today: string; stlyOffsetDays?: number },
): Promise<{ ratio: number; currentRooms: number; lastYearRooms: number } | null> {
  const { hotelId, stayDate, today } = params
  const stlyOffset = params.stlyOffsetDays ?? 364 // anno "shiftato" di 52 settimane (allinea i giorni della settimana)
  const leadDays = daysBetween(today, stayDate)
  if (leadDays < 0) return null

  const lyStay = addDays(stayDate, -stlyOffset)
  const lyAsOf = addDays(lyStay, -leadDays) // stesso lead time un anno fa

  const [cyBookings, lyBookings] = await Promise.all([
    fetchPaceBookings(supabase, hotelId, stayDate, addDays(stayDate, 1)),
    fetchPaceBookings(supabase, hotelId, lyStay, addDays(lyStay, 1)),
  ])

  const cur = sumOtb(computeOtb(cyBookings, today, stayDate, addDays(stayDate, 1)))
  const ly = sumOtb(computeOtb(lyBookings, lyAsOf, lyStay, addDays(lyStay, 1)))

  if (ly.rooms <= 0) return null
  return { ratio: cur.rooms / ly.rooms, currentRooms: cur.rooms, lastYearRooms: ly.rooms }
}
