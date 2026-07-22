/**
 * GSheets Header Aliases
 * 
 * Centralised alias map that resolves the many header variants across PMS exports
 * (Bedzzle, Slope, WuBook, etc.) to Santaddeo canonical logical keys.
 * 
 * How it works:
 * 1. Every raw header from the sheet is lower-cased and trimmed.
 * 2. If it matches an alias, we know which logical key it represents.
 * 3. The alias map is used BOTH for auto-detection (when no columnMap is configured)
 *    AND for fallback resolution (when columnMap points to a header that does not exist).
 * 
 * To add a new PMS, just add its header variants to the arrays below.
 */

// Logical key -> all known header variations (lowercase, trimmed)
const HEADER_ALIAS_MAP: Record<string, string[]> = {
  // ── Booking identification ──
  id_prenotazione: [
    "id_prenotazione", "id prenotazione", "booking_id", "bookingid",
    "reservation_id", "reservationid", "res_id", "id",
    "numero_prenotazione", "numero prenotazione", "bk_id",
    "codice_prenotazione", "codice prenotazione",
  ],

  // ── Booking date (creation date) ──
  data_prenotazione: [
    "data_prenotazione", "data prenotazione", "booking_date", "bookingdate",
    "bk_date", "bkdate", "booking date", "creation_date", "creationdate",
    "creation date", "data_creazione", "data creazione", "created_at",
    "data inserimento", "data_inserimento", "insert_date",
    // Additional Bedzzle / PMS variations
    "reservation_date", "reservationdate", "reservation date",
    "booked_date", "bookeddate", "booked date", "order_date", "orderdate",
    "data_ordine", "data ordine", "data_booking", "databooking",
  ],

  // ── Check-in / Check-out ──
  check_in: [
    "check_in", "checkin", "check-in", "check in", "checkin_date",
    "checkindate", "arrival", "arrival_date", "arrivaldate",
    "data_arrivo", "data arrivo", "from", "from_date",
    // Additional Bedzzle / PMS variations
    "arrivo", "in_date", "indate", "start_date", "startdate",
    "check_in_date", "data_checkin", "datacheckin",
  ],
  check_out: [
    "check_out", "checkout", "check-out", "check out", "checkout_date",
    "checkoutdate", "departure", "departure_date", "departuredate",
    "data_partenza", "data partenza", "to", "to_date",
    // Additional Bedzzle / PMS variations
    "partenza", "out_date", "outdate", "end_date", "enddate",
    "check_out_date", "data_checkout", "datacheckout",
  ],

  // ── Room / accommodation ──
  camera: [
    "camera", "room", "room_type", "roomtype", "room type",
    "tipo_camera", "tipo camera", "tipologia", "accommodation",
    "codice_camera", "codice camera", "room_code", "roomcode",
    "room_type_code", "roomtypecode",
  ],

  // ── Guest ──
  nome_ospite: [
    "nome_ospite", "nome ospite", "guest_name", "guestname",
    "guest name", "nome", "name", "cliente", "customer",
    "cognome_ospite", "cognome ospite", "ospite",
  ],

  // ── Status / cancellation ──
  stato: [
    "stato", "status", "state", "booking_status", "bookingstatus",
    "reservation_status", "stato_prenotazione", "stato prenotazione",
  ],
  cancellata: [
    "cancellata", "cancelled", "canceled", "is_cancelled", "iscancelled",
    "cancellation", "annullata", "annullato",
  ],
  data_cancellazione: [
    "data_cancellazione", "data cancellazione", "cancellation_date",
    "cancellationdate", "cancellation date", "cancel_date", "canceldate",
    "data_annullamento", "data annullamento",
  ],
  motivo_cancellazione: [
    "motivo_cancellazione", "motivo cancellazione", "cancellation_reason",
    "cancellationreason", "cancellation reason", "cancel_reason",
  ],

  // ── Pricing ──
  prezzo_totale: [
    "prezzo_totale", "prezzo totale", "total_price", "totalprice",
    "total price", "total", "importo", "amount", "total_amount",
    "totalamount", "revenue", "prezzo",
  ],
  prezzo_notte: [
    "prezzo_notte", "prezzo notte", "price_per_night", "pricepernight",
    "price per night", "daily_price", "dailyprice", "daily price",
    "adr", "tariffa_media", "tariffa media", "avg_rate",
  ],

  // ── Channel / source ──
  canale: [
    "canale", "channel", "source", "booking_source", "bookingsource",
    "booking source", "ota", "provenienza", "origine",
  ],
  diretto: [
    "diretto", "direct", "is_direct", "isdirect", "is direct",
  ],
  commissione_perc: [
    "commissione_perc", "commissione", "commission", "commission_rate",
    "commissionrate", "commission rate", "comm_perc", "comm",
  ],

  // ── Nights / rooms / guests ──
  num_notti: [
    "num_notti", "num notti", "nights", "number_of_nights", "numberofnights",
    "number of nights", "notti", "los", "length_of_stay",
  ],
  num_camere: [
    "num_camere", "num camere", "rooms", "number_of_rooms", "numberofrooms",
    "number of rooms", "camere",
  ],
  num_ospiti: [
    "num_ospiti", "num ospiti", "guests", "number_of_guests", "numberofguests",
    "number of guests", "pax", "persone", "ospiti",
  ],

  // ── Guest contact ──
  email_ospite: [
    "email_ospite", "email ospite", "email", "guest_email", "guestemail",
    "guest email", "e-mail",
  ],
  telefono_ospite: [
    "telefono_ospite", "telefono ospite", "phone", "telephone",
    "guest_phone", "guestphone", "guest phone", "tel", "telefono",
  ],
  paese_ospite: [
    "paese_ospite", "paese ospite", "country", "guest_country",
    "guestcountry", "guest country", "nazione", "nazionalita",
  ],

  // ── Availability ──
  data: [
    "data", "date", "giorno", "day",
  ],
  codice_camera: [
    "codice_camera", "codice camera", "room_code", "roomcode",
    "room code", "room_type_code", "tipo_camera", "tipo camera",
  ],
  camere_totali: [
    "camere_totali", "camere totali", "total_rooms", "totalrooms",
    "total rooms", "inventory",
  ],
  camere_fuori_servizio: [
    "camere_fuori_servizio", "camere fuori servizio", "out_of_service",
    "outofservice", "out of service", "oos", "fuori_servizio",
  ],
  camere_disponibili: [
    "camere_disponibili", "camere disponibili", "available_rooms",
    "availablerooms", "available rooms", "availability", "disponibilita",
  ],

  // ── Rates ──
  nome_tariffa: [
    "nome_tariffa", "nome tariffa", "rate_name", "ratename",
    "rate name", "tariffa", "rate", "rate_plan", "rateplan",
  ],
  soggiorno_minimo: [
    "soggiorno_minimo", "soggiorno minimo", "min_stay", "minstay",
    "min stay", "minimum_stay", "minimumstay", "minimum stay",
  ],
}

/**
 * Normalize a header string for comparison.
 * Converts to lowercase, replaces spaces/dashes with underscores, removes duplicates.
 */
export function normalizeHeader(header: string): string {
  if (!header) return ""
  return header
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
}

// Build a reverse lookup: lowercased alias -> canonical logical key
const _reverseLookup = new Map<string, string>()
for (const [logicalKey, aliases] of Object.entries(HEADER_ALIAS_MAP)) {
  for (const alias of aliases) {
    _reverseLookup.set(alias.toLowerCase(), logicalKey)
  }
}

/**
 * Given a raw header string from a GSheet, return the canonical logical key
 * (e.g. "BOOKING_DATE" -> "data_prenotazione", "Check In" -> "check_in")
 * Returns undefined if no alias matches.
 */
export function resolveHeaderAlias(rawHeader: string): string | undefined {
  if (!rawHeader) return undefined
  const normalized = rawHeader.trim().toLowerCase().replace(/\s+/g, " ")
  // Direct match
  if (_reverseLookup.has(normalized)) return _reverseLookup.get(normalized)
  // Try underscore variant: "Booking Date" -> "booking_date"
  const underscored = normalized.replace(/ /g, "_")
  if (_reverseLookup.has(underscored)) return _reverseLookup.get(underscored)
  return undefined
}

/**
 * Given an array of raw headers from a GSheet, build an auto-detected columnMap.
 * Only includes headers that resolve to a known alias.
 * The returned map is: logicalKey -> original raw header string (preserving case).
 */
export function autoDetectColumnMap(rawHeaders: string[], enableLogging = true): Record<string, string> {
  const detected: Record<string, string> = {}
  for (const rawHeader of rawHeaders) {
    const logicalKey = resolveHeaderAlias(rawHeader)
    if (logicalKey && !detected[logicalKey]) {
      // Store the ORIGINAL header (not lowered) so headerIndex lookup works
      detected[logicalKey] = rawHeader
      if (enableLogging) {
        console.log(`AUTO HEADER DETECTED: ${logicalKey} -> "${rawHeader}"`)
      }
    }
  }
  return detected
}

/**
 * Given a configured columnMap and the actual raw headers from the sheet,
 * validate and repair the columnMap:
 * - If a mapped column name exists in headers -> keep it
 * - If a mapped column name does NOT exist -> try to find the correct header via aliases
 * - Log all repairs for traceability
 * 
 * Returns the repaired columnMap (new object, original is not mutated).
 */
export function repairColumnMap(
  columnMap: Record<string, string>,
  rawHeaders: string[],
): Record<string, string> {
  const headerSet = new Set(rawHeaders.map(h => h.trim()))
  const headerSetUpper = new Set(rawHeaders.map(h => h.trim().toUpperCase()))
  const autoDetected = autoDetectColumnMap(rawHeaders)
  const repaired: Record<string, string> = { ...columnMap }

  for (const [logicalKey, configuredColName] of Object.entries(columnMap)) {
    const trimmed = configuredColName.trim()
    // Check if the configured column name exists in headers (exact or uppercase)
    if (headerSet.has(trimmed) || headerSetUpper.has(trimmed.toUpperCase())) {
      continue // All good, keep as-is
    }

    // Column not found -> try auto-detection
    if (autoDetected[logicalKey]) {
      console.warn(
        `[GSheets HeaderAliases] REPAIRED: "${logicalKey}" mapped to "${configuredColName}" (NOT FOUND), ` +
        `auto-resolved to "${autoDetected[logicalKey]}" via alias`
      )
      repaired[logicalKey] = autoDetected[logicalKey]
    } else {
      console.warn(
        `[GSheets HeaderAliases] UNRESOLVED: "${logicalKey}" mapped to "${configuredColName}" (NOT FOUND), ` +
        `no alias match in headers: [${rawHeaders.slice(0, 20).join(", ")}]`
      )
    }
  }

  // Also add any auto-detected keys that are missing from the configured map
  for (const [logicalKey, detectedHeader] of Object.entries(autoDetected)) {
    if (!repaired[logicalKey]) {
      console.log(
        `[GSheets HeaderAliases] AUTO-ADDED: "${logicalKey}" -> "${detectedHeader}" (not in configured columnMap)`
      )
      repaired[logicalKey] = detectedHeader
    }
  }

  return repaired
}
