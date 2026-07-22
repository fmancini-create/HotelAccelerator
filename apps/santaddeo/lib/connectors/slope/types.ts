/**
 * Tipi per la Partner API Slope (v1).
 *
 * Fonte: documentazione "Partner API (v1)" fornita da Slope (13/07/2026),
 * verificata live contro la sandbox https://api.staging.slope.it.
 *
 * Caratteristiche chiave dell'API:
 *  - Auth: header `Authorization: bearer <token>` (un token per struttura,
 *    quindi NIENTE property_id separato: il token identifica la struttura).
 *  - Paginazione: 50 elementi/pagina, `?page=N`, risposta con
 *    `pagination.hasNextPage`.
 *  - Espansioni: `?expand=a,b.c` per includere relazioni.
 *  - Filtri: `?filter=prop:op:valore` (op: eq/lt/gt/le/ge), multipli in AND
 *    separati da virgola.
 *  - Rate limit: 30 richieste/minuto per partner.
 *  - Errori: body JSON { code, message, data }.
 */

export interface SlopeConfig {
  /** Base URL: https://api.slope.it (prod) o https://api.staging.slope.it (sandbox). */
  baseUrl: string
  /** Bearer token per-struttura fornito da Slope. */
  apiKey: string
}

/** Stringa multilingua Slope: [{ locale: "it", value: "..." }, ...] */
export interface SlopeMultiLanguageString {
  locale: string
  value: string | null
}

/** Date range Slope (date ISO yyyy-mm-dd). Semantica: entrambi inclusivi. */
export interface SlopeDateRange {
  start: string
  end: string
}

export interface SlopePagination {
  hasNextPage: boolean
}

export interface SlopePaginatedResponse<T> {
  pagination: SlopePagination
  data: T[]
}

export interface SlopeSingleResponse<T> {
  data: T
}

/** GET /v1/establishment */
export interface SlopeEstablishment {
  id: string
  name: string
  settings?: Record<string, unknown>
}

/** GET /v1/lodging-types — tipologia alloggio (es. "Camera matrimoniale standard"). */
export interface SlopeLodgingType {
  id: string
  name: SlopeMultiLanguageString[]
  /** Presenti solo con expand=lodgings / ratePlans. */
  lodgings?: SlopeLodging[]
  ratePlans?: SlopeRatePlan[]
  nominalCapacity: number
  /** Numero massimo di adulti: i rate update richiedono prezzi per occ 1..maximumCapacity. */
  maximumCapacity: number
  /** Quantità di alloggi di questa tipologia (capacità inventario). */
  quantity: number
}

/** Alloggio fisico (camera 203, ...). */
export interface SlopeLodging {
  id: string
  name?: string | null
  [key: string]: unknown
}

export type SlopeTreatment =
  | "ALL_INCLUSIVE"
  | "BED_AND_BREAKFAST"
  | "FULL_BOARD"
  | "HALF_BOARD"
  | "STAY_ONLY"

/** GET /v1/rate-plans — piano tariffario. */
export interface SlopeRatePlan {
  id: string
  name: SlopeMultiLanguageString[]
  treatment?: SlopeTreatment
  /**
   * ATTENZIONE: i prezzi (rateUpdates.rates) NON possono essere aggiornati
   * su piani derivati. Push solo su piani con isDerived=false.
   */
  isDerived?: boolean
  lodgingTypes?: SlopeLodgingType[]
  [key: string]: unknown
}

export interface SlopeStayPeriod {
  /** Data di arrivo (yyyy-mm-dd). */
  arrival: string
  /** Data di partenza (yyyy-mm-dd). */
  departure: string
}

export interface SlopeGuestCounts {
  adults?: number
  children?: number
  infants?: number
  [key: string]: unknown
}

/** Prezzo per singola notte (con expand=pricesByDate). */
export interface SlopePriceByDate {
  date?: string
  /** Valore monetario come stringa "123.45". */
  price?: string | null
  [key: string]: unknown
}

export type SlopeSaleSource = "DIRECT" | "BOOKING_ENGINE" | "CHANNEL_MANAGER" | "OTHER"

/**
 * GET /v1/lodging-reservations — prenotazione.
 * I campi opzionali arrivano solo con le relative expand.
 */
export interface SlopeReservation {
  id: string
  creationDate: string
  lastUpdateDate: string
  stayPeriod: SlopeStayPeriod
  guestCounts: SlopeGuestCounts
  isCanceled: boolean
  isOption: boolean
  /** NB: la sandbox ritorna anche il typo "isOvebooking"; il client li normalizza. */
  isOverbooking?: boolean
  cancellationDate: string | null
  checkInDate: string | null
  checkOutDate: string | null
  saleSource: SlopeSaleSource
  discounts?: unknown[]
  order?: {
    id?: string
    customer?: Record<string, unknown>
    agency?: Record<string, unknown>
    [key: string]: unknown
  }
  lodgingType?: SlopeLodgingType | { id: string; [key: string]: unknown }
  lodging?: SlopeLodging | null
  marketSegment?: { id?: string; name?: unknown } | null
  pricesByDate?: SlopePriceByDate[]
  primaryGuest?: Record<string, unknown> | null
  ratePlansByDateRange?: Array<{
    dateRange?: SlopeDateRange
    ratePlan?: { id?: string; [key: string]: unknown }
    [key: string]: unknown
  }>
  stayTaxAmount?: string | null
  [key: string]: unknown
}

/** Espansioni supportate da /v1/lodging-reservations. */
export type SlopeReservationExpand =
  | "bedConfiguration"
  | "discounts"
  | "guestAreaCheckInUrl"
  | "lodging"
  | "lodgingType"
  | "marketSegment"
  | "mealsByDateRange"
  | "order.agency"
  | "order.customer.customFields"
  | "order.customer.primaryEmail"
  | "order.customer.primaryPhoneNumber"
  | "pricesByDate"
  | "primaryGuest"
  | "ratePlansByDateRange"
  | "stayTaxAmount"

// --- POST /v1/lodging-types/{id}/rates-and-availability-updates ---

/** Prezzo per una specifica occupazione. `rate` a "0.00" = occupazione non in vendita. */
export interface SlopeRateForUpdate {
  occupancy: number
  /** Money: stringa con 2 decimali, es. "129.00". */
  rate: string
}

export interface SlopeRateUpdate {
  dateRange: SlopeDateRange
  ratePlanId: string
  /**
   * DEVE contenere il prezzo per TUTTE le occupazioni della lodging type
   * (da 1 a maximumCapacity), altrimenti 400.
   */
  rates: SlopeRateForUpdate[]
}

export interface SlopeClosureUpdate {
  dateRange: SlopeDateRange
  ratePlanId: string
  /** true = chiusura tariffaria; false = rimuove la chiusura. */
  closed: boolean
}

export interface SlopeRatesAndAvailabilityPayload {
  rateUpdates?: SlopeRateUpdate[]
  closureUpdates?: SlopeClosureUpdate[]
  priceTemplateApplicationUpdates?: Array<{
    dateRange: SlopeDateRange
    priceTemplateId: string
  }>
}

/** Vincoli documentati per l'endpoint rates-and-availability-updates. */
export const SLOPE_MAX_UPDATES_PER_REQUEST = 500
export const SLOPE_MAX_RATE_CALLS_PER_MINUTE = 5

// --- POST /v1/deleted-resources ---

export type SlopeDeletedResourceType =
  | "CREDIT_NOTES"
  | "EXTRA_LINE_ITEMS"
  | "INVOICES"
  | "LODGING_CLOSURES"
  | "LODGING_RESERVATIONS"
  | "PAYMENTS"
  | "PRICE_TEMPLATES"
  | "RECEIPTS"

/** Body di errore standard Slope. */
export interface SlopeErrorBody {
  code: string
  message: string
  data: unknown
}

/** Estrae il nome italiano (fallback: inglese, poi prima non-null) da una MultiLanguageString. */
export function slopeName(name: SlopeMultiLanguageString[] | undefined | null): string {
  if (!Array.isArray(name) || name.length === 0) return ""
  const by = (loc: string) => name.find((n) => n.locale === loc && n.value)?.value
  return by("it") ?? by("en") ?? name.find((n) => n.value)?.value ?? ""
}
