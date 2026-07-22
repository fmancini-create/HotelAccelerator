// Scidoo Data Mapper
// Transforms raw Scidoo data to SANTADDEO normalized format

import type { RoomTypeMapping } from "../types"

/**
 * Cache di lookup rate: pms_rate_id (string) -> { id, name, code }.
 * Popolato dai chiamanti pre-process leggendo la tabella canonica `rates`.
 * Serve a tradurre il `rate_id` numerico/stringa di Scidoo nell'UUID interno
 * della tabella `rates` E nel rate_name canonico, cosi' la pagina prenotazioni
 * e il guard possano confrontare correttamente le tariffe.
 *
 * Senza questo lookup la colonna `bookings.rate_id` resta NULL e:
 *  - la pagina /dati/bookings mostra "Tariffa: -"
 *  - il guard fa any-rate fallback su last_sent_prices, attribuendo
 *    erroneamente tariffe non vendute su quel canale (es. Be Safe a Booking).
 */
type RateCacheEntry = { id: string; name: string | null; code: string | null }

export class ScidooMapper {
  private hotelId: string
  private roomTypeMappings: Map<string, string>
  private rateToRoomType: Map<string, string>
  private rateCache: Map<string, RateCacheEntry>
  // Mappa room_type_id (UUID santaddeo) -> total_rooms (capacita' del room_type).
  // Usata in mapAvailability per ricostruire `total_rooms` quando Scidoo manda
  // `available_count=0 + occupied_count=0` (es. tutto in blocco/OOS interno):
  // senza questa mappa il mapper scriveva total_rooms=0, facendo "sparire" la
  // capacita' dalla dashboard. Vedi incident Moriano 23/05/2026 (9 giorni
  // 23/11-01/12 Trilocale Luxury con tot=0).
  private roomTypeCapacityMap: Map<string, number>

  constructor(
    hotelId: string,
    roomTypeMappings: RoomTypeMapping[],
    rateToRoomType?: Map<string, string>,
    rateCache?: Map<string, RateCacheEntry>,
    roomTypeCapacityMap?: Map<string, number>,
  ) {
    this.hotelId = hotelId
    this.roomTypeMappings = new Map(roomTypeMappings.map((m) => [m.scidoo_room_type_id, m.santaddeo_room_type_id]))
    this.rateToRoomType = rateToRoomType || new Map()
    this.rateCache = rateCache || new Map()
    this.roomTypeCapacityMap = roomTypeCapacityMap || new Map()
  }

  mapBooking(rawBooking: any) {
    // Map Scidoo booking to SANTADDEO bookings table format
    // Scidoo raw_data structure:
    // - id/internal_id: booking ID
    // - room_type_id or list_dates_type_room[0].room_type_id: room type
    // - creation: booking datetime "YYYY-MM-DD HH:MM"
    // - checkin_date, checkout_date: dates
    // - customer: { first_name, last_name, email, mobile, ... }
    // - agency: { name, reservation_id }
    // - daily_price: { "YYYY-MM-DD": price, ... }
    // - status: "annullata", "confermata", etc.
    // - cancellation: cancellation datetime
    // - guest_count: number of guests
    // - nights: number of nights

    // Extract room_type_id from various possible locations
    const scidooRoomTypeId = String(
      rawBooking.room_type_id || 
      rawBooking.list_dates_type_room?.[0]?.room_type_id || 
      "0"
    )
    let roomTypeId = this.roomTypeMappings.get(scidooRoomTypeId)
    // Fallback: when Scidoo sends room_type_id=0, resolve via rate_id
    if (!roomTypeId && (scidooRoomTypeId === "0" || !rawBooking.room_type_id)) {
      const rateId = String(rawBooking.rate_id || "")
      roomTypeId = this.rateToRoomType.get(rateId)
    }

    // Extract customer info
    const customer = rawBooking.customer || {}
    const guestName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unknown"
    
    // Extract booking date from creation field "YYYY-MM-DD HH:MM"
    const creationDate = rawBooking.creation ? rawBooking.creation.split(" ")[0] : null
    const creationDatetime = rawBooking.creation ? rawBooking.creation.replace(" ", "T") + ":00Z" : null

    // Calculate total price from daily_price object
    const dailyPrices = rawBooking.daily_price || {}
    const totalPrice = Object.values(dailyPrices).reduce((sum: number, price: any) => sum + (Number(price) || 0), 0)
    const nights = rawBooking.nights || Object.keys(dailyPrices).length || this.calculateNights(rawBooking.checkin_date, rawBooking.checkout_date)
    const pricePerNight = nights > 0 ? totalPrice / nights : 0

    // Extract channel from agency - ensure string type
    const channel = String(rawBooking.agency?.name || rawBooking.origin || "unknown")
    const channelLower = channel.toLowerCase()
    const isDirectChannel = channelLower.includes("direct") || 
                            channelLower.includes("diretto") ||
                            channelLower.includes("sito")

    // Handle cancellation
    const isCancelled = rawBooking.status === "cancelled" || rawBooking.status === "annullata"
    const cancellationDate = rawBooking.cancellation ? rawBooking.cancellation.split(" ")[0] : null
    const cancellationDatetime = rawBooking.cancellation ? rawBooking.cancellation.replace(" ", "T") + ":00Z" : null

    // Extract notes
    const notes = rawBooking.notes?.map((n: any) => n.description).join("\n") || null

    // Rate lookup: traduci il rate_id numerico di Scidoo nell'UUID di rates.
    // Conserviamo anche rate_name (snapshot dal raw, utile se la rate viene
    // rinominata in futuro) e rate_code (lo stesso pms_rate_id come stringa,
    // ridondante ma comodo per debug e per la UI quando il lookup fallisce).
    // FIX 30/04/2026: prima questi 3 campi non venivano scritti, quindi:
    //  - colonna "Tariffa" in /dati/bookings sempre vuota
    //  - guard faceva any-rate fallback (vedi guard/scan/route.ts)
    //    attribuendo Be Safe a Booking/Expedia su Barronci.
    const pmsRateId = rawBooking.rate_id != null ? String(rawBooking.rate_id) : null
    const rateInfo = pmsRateId ? this.rateCache.get(pmsRateId) : undefined

    return {
      hotel_id: this.hotelId,
      // CRITICAL: pms_booking_id must use rawBooking.id (the canonical Scidoo
      // booking id), not internal_id. Scidoo exposes two different identifiers
      // per booking:
      //   - id          -> short business id (e.g. "839"), matches
      //                    scidoo_raw_bookings.scidoo_booking_id and the
      //                    pms_booking_id produced by ScidooSyncService
      //   - internal_id -> long internal record id (e.g. "16911214"), not
      //                    user-facing
      // The previous code preferred internal_id, so every booking ended up
      // inserted TWICE in public.bookings: once by ScidooSyncService with
      // pms_booking_id=id, and once by the ETL BookingsProcessor with
      // pms_booking_id=internal_id. Totals differed because the two pipelines
      // compute the price with different fallbacks. Align to `id` so the
      // onConflict(hotel_id, pms_booking_id) upsert deduplicates correctly.
      pms_booking_id: rawBooking.id || rawBooking.internal_id,
      pms_reservation_number: rawBooking.agency?.reservation_id || rawBooking.internal_id || rawBooking.id,
      booking_date: creationDate,
      booking_datetime: creationDatetime,
      check_in_date: rawBooking.checkin_date,
      check_out_date: rawBooking.checkout_date,
      room_type_id: roomTypeId || null,
      guest_name: guestName,
      guest_email: customer.email || null,
      guest_phone: customer.mobile || customer.phone || null,
      guest_country: customer.citizenship || null,
      guest_notes: notes,
      number_of_rooms: rawBooking.list_dates_room?.length || 1,
      number_of_nights: nights,
      number_of_guests: rawBooking.guest_count || 1,
      price_per_night: pricePerNight,
      total_price: totalPrice,
      channel: channel,
      is_direct: isDirectChannel,
      commission_rate: null,
      commission_amount: null,
      is_cancelled: isCancelled,
      cancellation_date: cancellationDate,
      cancellation_datetime: cancellationDatetime,
      cancellation_reason: null,
      booking_pickup_days: creationDate && rawBooking.checkin_date 
        ? this.calculatePickupDays(creationDate, rawBooking.checkin_date) 
        : null,
      cancellation_pickup_days: cancellationDate && rawBooking.checkin_date
        ? this.calculatePickupDays(cancellationDate, rawBooking.checkin_date)
        : null,
      // A booking is a "room booking" only if we resolved a valid room_type_id.
      // Entries with room_type_id=NULL are service-only (city tax, extras, "Da Assegnare")
      // and must NOT count towards occupancy / arrivals / room KPIs.
      is_room_booking: roomTypeId != null,
      // Rate fields: rate_id e' l'UUID interno (FK rates), rate_name e' lo
      // snapshot del nome al momento del booking (resiste a rinominazioni
      // future), rate_code e' il pms_rate_id come stringa.
      rate_id: rateInfo?.id || null,
      rate_name: rawBooking.rate_name || rateInfo?.name || null,
      rate_code: pmsRateId,
      source: "scidoo",
      imported_at: new Date().toISOString(),
    }
  }

  mapAvailability(rawAvailability: any) {
    const roomTypeId = this.roomTypeMappings.get(rawAvailability.room_type_id)

    // Scidoo API returns available_count, not rooms_available
    const availableCount = rawAvailability.available_count || 0
    const occupiedCount = rawAvailability.occupied_count || 0
    const oosFromScidoo = rawAvailability.rooms_out_of_service || 0
    const sumCount = availableCount + occupiedCount
    // FIX 23/05/2026 (incident Moriano - Trilocale Luxury 9 giorni "fantasma"
    // 23/11-01/12 con total_rooms=0). Quando Scidoo manda available=0 +
    // occupied=0 (giorno completamente bloccato lato PMS) il fallback
    // `available + occupied` dava 0 e total_rooms finiva a 0, facendo
    // sparire il room type dalla capacita' dell'hotel quel giorno. Ora
    // usiamo come ultima fallback la capacita' canonica del room_type
    // (room_types.total_rooms) cosi' la riga ha sempre capacita' coerente.
    const fallbackCapacity = roomTypeId ? this.roomTypeCapacityMap.get(roomTypeId) || 0 : 0
    const totalRooms = rawAvailability.total_rooms || sumCount || fallbackCapacity || 0

    // FIX 21/07/2026 (incident Moriano - ferie/manutenzione contate come
    // vendute). Scidoo NON espone il fuori servizio: `getAvailability` da' solo
    // available_count (libere) e occupied_count (prenotate). Le camere che non
    // sono ne' libere ne' prenotate sono BLOCCATE (ferie, manutenzione,
    // chiusura) => vero fuori servizio. Prima l'oos veniva ricostruito SOLO nel
    // caso limite available=0 & occupied=0 con total dal fallback; il caso
    // PARZIALE (es. Bilocale ferie: total 2, avail 1, occ 0 -> 1 camera in
    // ferie) restava con oos=0 e a valle `sold = total - available = 1` la
    // contava come venduta. Idem Trilocale in ferie total 4/avail 0/occ 0 ->
    // sold=4. Ora deriviamo l'oos dall'invariante PMS
    //   total = available + occupied + oos  =>  oos = total - available - occupied
    // cosi' a valle sold = total - available - oos = occupied (le SOLE vendite
    // reali) e la capacita' netta = total - oos. Verificato su dati certi
    // Moriano: sui giorni prenotati total=available+occupied -> oos=0 (nessun
    // falso positivo); nei periodi di ferie oos = camere bloccate. Se un giorno
    // Scidoo dovesse fornire un oos esplicito (>0) lo rispettiamo.
    const derivedOos = Math.max(0, totalRooms - availableCount - occupiedCount)
    const roomsOutOfService = oosFromScidoo > 0 ? oosFromScidoo : derivedOos

    return {
      hotel_id: this.hotelId,
      room_type_id: roomTypeId || null,
      date: rawAvailability.date,
      rooms_available: availableCount,
      total_rooms: totalRooms,
      rooms_out_of_service: roomsOutOfService,
      source: "scidoo",
      imported_at: new Date().toISOString(),
    }
  }

  mapRate(rawRate: any) {
    // Map Scidoo rate to SANTADDEO pricing_recommendations table format
    const roomTypeId = this.roomTypeMappings.get(rawRate.room_type_id)

    return {
      hotel_id: this.hotelId,
      room_type_id: roomTypeId || null,
      date: rawRate.date,
      current_price: rawRate.price,
      recommended_price: rawRate.price, // Initially same as current
      confidence_score: 1.0,
      algorithm_type: "pms_import",
      factors: {
        source: "scidoo",
        rate_id: rawRate.rate_id,
      },
      applied: true,
      applied_at: new Date().toISOString(),
    }
  }

  mapFiscalProduction(rawProduction: any) {
    // Map Scidoo fiscal production to SANTADDEO daily_production table format
    return {
      hotel_id: this.hotelId,
      date: rawProduction.date,
      total_revenue: rawProduction.total_revenue || 0,
      direct_revenue: rawProduction.direct_revenue || null,
      intermediated_revenue: rawProduction.intermediated_revenue || null,
      source: "scidoo",
      calculated_at: new Date().toISOString(),
    }
  }

  private calculateNights(checkinDate: string, checkoutDate: string): number {
    const checkin = new Date(checkinDate)
    const checkout = new Date(checkoutDate)
    const diffTime = Math.abs(checkout.getTime() - checkin.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  private calculatePickupDays(fromDate: string, toDate: string): number {
    const from = new Date(fromDate)
    const to = new Date(toDate)
    const diffTime = to.getTime() - from.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }
}
