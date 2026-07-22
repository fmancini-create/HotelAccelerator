// BRiG Data Mapper
// Trasforma il payload grezzo di una BrigReservation nella shape canonica
// di `public.bookings` (parallelo a `ScidooMapper`).

import { BRIG_STATUS, brigStatusToCode, parseNightlyPrices, type BrigReservation } from "@/lib/connectors/brig/types"

export interface BrigRoomTypeMapping {
  /** Codice camera lato Brig (es. "DUS", "DBL") */
  brig_room_code: string
  /** UUID room_types.id lato RMS Santaddeo */
  santaddeo_room_type_id: string
}

/**
 * Output del mapping: lo shape coincide 1:1 con le colonne di `public.bookings`
 * usate dall'upsert con onConflict (hotel_id, pms_booking_id).
 */
export interface BrigBookingRow {
  hotel_id: string
  pms_booking_id: string
  pms_reservation_number: string | null
  booking_date: string | null
  booking_datetime: string | null
  check_in_date: string
  check_out_date: string
  room_type_id: string | null
  guest_name: string | null
  guest_email: string | null
  guest_phone: string | null
  guest_country: string | null
  guest_notes: string | null
  number_of_rooms: number
  number_of_nights: number
  number_of_guests: number
  price_per_night: number
  total_price: number
  /**
   * Breakdown PER-NOTTE reale { "YYYY-MM-DD": prezzoEUR } da `amountDetail`.
   * Usato per la produzione GIORNALIERA esatta (non spalmata in media). Null
   * se la prenotazione non espone un dettaglio per-notte (si ricade su
   * price_per_night uniforme a valle).
   */
  nightly_prices: Record<string, number> | null
  channel: string | null
  is_direct: boolean
  commission_rate: number | null
  commission_amount: number | null
  is_cancelled: boolean
  cancellation_date: string | null
  cancellation_datetime: string | null
  cancellation_reason: string | null
  booking_pickup_days: number | null
  cancellation_pickup_days: number | null
  is_room_booking: boolean
  source: string
  imported_at: string
}

export class BrigMapper {
  private hotelId: string
  /** Map: brig_room_code (es. "DUS") -> room_types.id (UUID) */
  private roomCodeToRoomTypeId: Map<string, string>

  constructor(hotelId: string, mappings: BrigRoomTypeMapping[]) {
    this.hotelId = hotelId
    this.roomCodeToRoomTypeId = new Map(
      mappings
        .filter((m) => m.brig_room_code && m.santaddeo_room_type_id)
        .map((m) => [m.brig_room_code, m.santaddeo_room_type_id]),
    )
  }

  mapBooking(rawBooking: BrigReservation): BrigBookingRow | null {
    if (!rawBooking._id || !rawBooking.checkin || !rawBooking.checkout) return null

    // 21/05/2026: difensivo. BRiG nei dati reali puo' mandare checkin/checkout
    // come number (epoch) o Date oltre che stringa ISO. Normalizziamo a string
    // per evitare TypeError su .slice/.split downstream.
    const checkInISO = toISOStringSafe(rawBooking.checkin)
    const checkOutISO = toISOStringSafe(rawBooking.checkout)
    if (!checkInISO || !checkOutISO) return null

    const checkInDate = checkInISO.slice(0, 10)
    const checkOutDate = checkOutISO.slice(0, 10)
    const numberOfNights = diffNights(checkInISO, checkOutISO)
    if (numberOfNights <= 0) return null

    // Prezzo: estraiamo il breakdown PER-NOTTE reale da `amountDetail`
    // ({date,price} in EUR, oppure formati legacy mappati sulle notti). Il
    // totale = somma del per-notte; fallback a `amount` (già in EUR) se il
    // dettaglio non è disponibile. `nightly_prices` viene persistito per la
    // produzione GIORNALIERA esatta (vedi getRevenue branch non-Scidoo).
    const nightlyMap = parseNightlyPrices(rawBooking.amountDetail, checkInISO, numberOfNights)
    const nightlyKeys = Object.keys(nightlyMap)
    let totalPrice = 0
    if (nightlyKeys.length > 0) {
      totalPrice = nightlyKeys.reduce((s, k) => s + nightlyMap[k], 0)
    }
    if (totalPrice <= 0) {
      // `amount` di Brig è GIÀ in EUR (sample reale: "100.0000" = 100 €).
      const n = typeof rawBooking.amount === "string" ? Number(rawBooking.amount) : rawBooking.amount
      totalPrice = Number.isFinite(n) ? Number(n) : 0
    }
    const pricePerNight = numberOfNights > 0 ? totalPrice / numberOfNights : 0
    const nightlyPrices = nightlyKeys.length > 0 ? nightlyMap : null

    // Mapping camera: solo se Brig dichiara un roomCode mappato in
    // room_types.brig_room_code. Se non c'è mapping, room_type_id resta null
    // → la prenotazione viene marcata come is_room_booking=false (es. service-only).
    const roomCode = rawBooking.roomCode ?? null
    const roomTypeId = roomCode ? this.roomCodeToRoomTypeId.get(roomCode) ?? null : null

    // Stato di cancellazione: Brig manda sia `status=4` (CANCELLED) sia
    // `originalStatus="Annullata"`. Usiamo entrambi come segnali.
    const isCancelled = brigIsCancelled(rawBooking)

    // Source: il campo Brig è numerico (vedi BRIG_SOURCE) o stringa libera
    // (es. "UNKNOWN"). Lo normalizziamo a string per la colonna `channel`.
    const channel = normalizeChannel(rawBooking)
    const isDirect = channel === "DIR" || channel === "WEB"

    // Booking date: usiamo `dateReceived` come miglior approssimazione del
    // momento in cui la prenotazione è entrata nel PMS.
    const bookingDatetime = rawBooking.dateReceived ? toISOStringSafe(rawBooking.dateReceived) : null
    const bookingDate = bookingDatetime ? bookingDatetime.slice(0, 10) : null

    return {
      hotel_id: this.hotelId,
      // pms_booking_id usa `_id` Brig (univoco per struttura). Lo scegliamo
      // come chiave canonica perché `reservationCode` può essere riutilizzato
      // o assente per prenotazioni di test.
      pms_booking_id: rawBooking._id,
      pms_reservation_number: rawBooking.reservationCode ?? null,
      booking_date: bookingDate,
      booking_datetime: bookingDatetime,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      room_type_id: roomTypeId,
      guest_name: null, // Brig non espone i dati ospite nelle reservations base
      guest_email: null,
      guest_phone: null,
      guest_country: null,
      guest_notes: null,
      number_of_rooms: rawBooking.quantity ?? 1,
      number_of_nights: numberOfNights,
      number_of_guests: (rawBooking.adults ?? 0) + (rawBooking.children ?? 0) || 1,
      price_per_night: pricePerNight,
      total_price: totalPrice,
      nightly_prices: nightlyPrices,
      channel: channel,
      is_direct: isDirect,
      commission_rate: null,
      commission_amount: null,
      is_cancelled: isCancelled,
      cancellation_date: null, // Brig non manda data cancellazione: useremo dateReceived in futuro
      cancellation_datetime: null,
      cancellation_reason: null,
      booking_pickup_days:
        bookingDate && checkInDate ? calculatePickupDays(bookingDate, checkInDate) : null,
      cancellation_pickup_days: null,
      // Stessa regola di Scidoo: solo se abbiamo risolto un room_type_id valido.
      is_room_booking: roomTypeId != null,
      source: "brig",
      imported_at: new Date().toISOString(),
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function diffNights(checkin: string, checkout: string): number {
  const ci = new Date(checkin)
  const co = new Date(checkout)
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return 0
  return Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86_400_000))
}

/**
 * Normalizza un timestamp che BRiG puo' mandare come string ISO, number
 * (epoch ms o secondi), Date o oggetto MongoDB Extended JSON `{$date: ...}`.
 * Ritorna sempre una stringa ISO 8601 oppure null.
 */
function toISOStringSafe(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") return v
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString()
  if (typeof v === "number") {
    // epoch in secondi vs millisecondi: > 10^12 = ms, altrimenti s
    const ms = v > 1e12 ? v : v * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>
    if (typeof obj.$date === "string") return obj.$date
    if (typeof obj.$date === "number") return toISOStringSafe(obj.$date)
    if (obj.$date && typeof obj.$date === "object") {
      const inner = (obj.$date as Record<string, unknown>).$numberLong
      if (typeof inner === "string") return toISOStringSafe(Number(inner))
    }
  }
  return null
}

function brigIsCancelled(r: BrigReservation): boolean {
  const txt = (r.originalStatus || "").trim().toLowerCase()
  if (txt === "annullata" || txt === "cancelled" || txt === "cancellata") return true
  // BUG FIX 24/06/2026: il feed `daily-occupancy-filters` manda `status` come
  // STRINGA ("DELETED"/"CONFIRMED"), NON come numero BRIG_STATUS. Il vecchio
  // check `typeof r.status === "number"` non scattava MAI sulle reali "DELETED"
  // -> ~113 prenotazioni cancellate restavano is_cancelled=false in
  // public.bookings (overcount su produzione/ricavi). Normalizziamo con
  // brigStatusToCode (gestisce sia number che string) come fa già il processor
  // availability (raw_data->>'status' === 'DELETED').
  if (brigStatusToCode(r.status) === BRIG_STATUS.CANCELLED) return true
  return false
}

/**
 * Normalizza il channel: preferiamo il `channelCode` testuale Brig (es.
 * "DIR", "WEB", "OTA"). Se mancante, mappiamo `source` numerico ai codici
 * BRIG_CHANNEL noti. In ultima istanza ritorniamo null.
 */
function normalizeChannel(r: BrigReservation): string | null {
  if (r.channelCode && typeof r.channelCode === "string") return r.channelCode
  // Source come fallback: number (BRIG_SOURCE) o stringa libera.
  if (typeof r.source === "string" && r.source.length > 0) return r.source
  if (typeof r.source === "number") {
    // Mapping minimale: i source numerici (BOOKING_COM=0, EXPEDIA=1...) sono
    // tutti OTA. Direct/Web seguono channelCode quando disponibile.
    return "OTA"
  }
  return null
}

function calculatePickupDays(fromDateISO: string, toDateISO: string): number | null {
  const a = new Date(fromDateISO)
  const b = new Date(toDateISO)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}
