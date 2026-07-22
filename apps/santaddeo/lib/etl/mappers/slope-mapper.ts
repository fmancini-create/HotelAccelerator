// Slope Data Mapper
// Trasforma il payload grezzo di una SlopeReservation nella shape canonica
// di `public.bookings` (parallelo a BrigMapper / ScidooMapper).

import type { SlopeReservation } from "@/lib/connectors/slope/types"

export interface SlopeRoomTypeMapping {
  /** UUID lodging type lato Slope */
  slope_lodging_type_id: string
  /** UUID room_types.id lato RMS Santaddeo */
  santaddeo_room_type_id: string
}

/**
 * Shape 1:1 con le colonne di `public.bookings` usate dall'upsert con
 * onConflict (hotel_id, pms_booking_id). Identica a BrigBookingRow.
 */
export interface SlopeBookingRow {
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
  adults: number | null
  children: number | null
  price_per_night: number
  total_price: number
  /** Breakdown per-notte reale da `pricesByDate` (expand). */
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

export class SlopeMapper {
  private hotelId: string
  /** Map: slope lodgingType.id (UUID) -> room_types.id (UUID Santaddeo) */
  private lodgingTypeToRoomTypeId: Map<string, string>

  constructor(hotelId: string, mappings: SlopeRoomTypeMapping[]) {
    this.hotelId = hotelId
    this.lodgingTypeToRoomTypeId = new Map(
      mappings
        .filter((m) => m.slope_lodging_type_id && m.santaddeo_room_type_id)
        .map((m) => [m.slope_lodging_type_id, m.santaddeo_room_type_id]),
    )
  }

  mapBooking(raw: SlopeReservation): SlopeBookingRow | null {
    if (!raw.id || !raw.stayPeriod?.arrival || !raw.stayPeriod?.departure) return null

    const checkInDate = raw.stayPeriod.arrival.slice(0, 10)
    const checkOutDate = raw.stayPeriod.departure.slice(0, 10)
    const numberOfNights = diffNights(checkInDate, checkOutDate)
    if (numberOfNights <= 0) return null

    // Prezzi per-notte: expand=pricesByDate ritorna [{date, price:"123.45"}].
    // Money Slope = stringa con 2 decimali, GIA' al lordo (prezzo di vendita).
    const nightlyMap: Record<string, number> = {}
    if (Array.isArray(raw.pricesByDate)) {
      for (const p of raw.pricesByDate) {
        const date = typeof p?.date === "string" ? p.date.slice(0, 10) : null
        const val = p?.price != null ? Number(p.price) : NaN
        if (date && Number.isFinite(val)) nightlyMap[date] = val
      }
    }
    const nightlyKeys = Object.keys(nightlyMap)
    let totalPrice = nightlyKeys.reduce((s, k) => s + nightlyMap[k], 0)
    if (totalPrice <= 0) totalPrice = 0
    const pricePerNight = numberOfNights > 0 ? totalPrice / numberOfNights : 0

    // Mapping camera: lodgingType.id (expand=lodgingType) -> room_types.slope_lodging_type_id.
    const lodgingTypeId =
      raw.lodgingType && typeof raw.lodgingType === "object" && typeof raw.lodgingType.id === "string"
        ? raw.lodgingType.id
        : null
    const roomTypeId = lodgingTypeId ? this.lodgingTypeToRoomTypeId.get(lodgingTypeId) ?? null : null

    // Cancellazione: flag esplicito + cancellationDate sempre valorizzata quando true.
    // NB: isOverbooking NON e' una cancellazione ma per la disponibilita' Slope
    // la tratta "al pari di una annullata" — la teniamo attiva per la produzione
    // (genera ricavi reali) e lasciamo l'eventuale esclusione all'occupancy a valle.
    const isCancelled = raw.isCanceled === true
    const cancellationDatetime = raw.cancellationDate ?? null
    const cancellationDate = cancellationDatetime ? cancellationDatetime.slice(0, 10) : null

    // Ospite principale (expand=primaryGuest): campi variabili, estraiamo il nome.
    const guestName = extractGuestName(raw.primaryGuest)

    // Canale: saleSource Slope e' un enum pulito.
    const channel = raw.saleSource ?? null
    const isDirect = channel === "DIRECT" || channel === "BOOKING_ENGINE"

    const bookingDatetime = raw.creationDate ?? null
    const bookingDate = bookingDatetime ? bookingDatetime.slice(0, 10) : null

    return {
      hotel_id: this.hotelId,
      pms_booking_id: raw.id,
      pms_reservation_number: null, // Slope non espone un codice umano separato dall'id
      booking_date: bookingDate,
      booking_datetime: bookingDatetime,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      room_type_id: roomTypeId,
      guest_name: guestName,
      guest_email: null,
      guest_phone: null,
      guest_country: null,
      guest_notes: null,
      number_of_rooms: 1, // 1 reservation Slope = 1 alloggio
      number_of_nights: numberOfNights,
      number_of_guests: (raw.guestCounts?.adults ?? 0) + (raw.guestCounts?.children ?? 0) || 1,
      adults: raw.guestCounts?.adults ?? null,
      children: raw.guestCounts?.children ?? null,
      price_per_night: pricePerNight,
      total_price: totalPrice,
      nightly_prices: nightlyKeys.length > 0 ? nightlyMap : null,
      channel,
      is_direct: isDirect,
      commission_rate: null,
      commission_amount: null,
      is_cancelled: isCancelled,
      cancellation_date: cancellationDate,
      cancellation_datetime: cancellationDatetime,
      cancellation_reason: null,
      booking_pickup_days: bookingDate ? calculatePickupDays(bookingDate, checkInDate) : null,
      cancellation_pickup_days:
        cancellationDate && checkInDate ? calculatePickupDays(cancellationDate, checkInDate) : null,
      is_room_booking: roomTypeId != null,
      source: "slope",
      imported_at: new Date().toISOString(),
    }
  }
}

function diffNights(checkin: string, checkout: string): number {
  const ci = new Date(`${checkin}T00:00:00Z`)
  const co = new Date(`${checkout}T00:00:00Z`)
  if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) return 0
  return Math.max(0, Math.round((co.getTime() - ci.getTime()) / 86_400_000))
}

function calculatePickupDays(fromDateISO: string, toDateISO: string): number | null {
  const a = new Date(fromDateISO)
  const b = new Date(toDateISO)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Estrae un nome leggibile dal primaryGuest (shape Individual, campi variabili). */
function extractGuestName(guest: Record<string, unknown> | null | undefined): string | null {
  if (!guest || typeof guest !== "object") return null
  const first = typeof guest.firstName === "string" ? guest.firstName : ""
  const last = typeof guest.lastName === "string" ? guest.lastName : ""
  const full = `${first} ${last}`.trim()
  if (full) return full
  if (typeof guest.name === "string" && guest.name.trim()) return guest.name.trim()
  return null
}
