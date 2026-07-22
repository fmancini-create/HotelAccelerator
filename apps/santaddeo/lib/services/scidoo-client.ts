/**
 * Scidoo API Client
 * Gestisce tutte le chiamate API a Scidoo PMS
 * Documentazione: https://www.scidoo.com/api/v1/
 * 
 * Resilience features:
 * - Retry with exponential backoff (2s, 4s, 8s - max 3 attempts)
 * - Circuit breaker via Redis (trips after 5 consecutive failures, resets after 5 min)
 */

import { Redis } from "@upstash/redis"

const SCIDOO_API_BASE_URL = "https://www.scidoo.com/api/v1"

// Retry configuration
const MAX_RETRIES = 3
const BASE_DELAY_MS = 2000 // 2 seconds

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5 // failures before opening
const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000 // 5 minutes

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  isOpen: boolean
}

let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  }
  return _redis
}

/**
 * Derive a short, Redis-safe key suffix from an endpoint path.
 * e.g. "/bookings/get.php" -> "bookings-get"
 */
function endpointKey(endpoint: string): string {
  return endpoint
    .replace(/^\//, "")
    .replace(/\.php$/, "")
    .replace(/\//g, "-")
}

async function getCircuitState(hotelId: string, endpoint: string): Promise<CircuitBreakerState> {
  const redis = getRedis()
  if (!redis) return { failures: 0, lastFailure: 0, isOpen: false }
  try {
    const key = `circuit:scidoo:${hotelId}:${endpointKey(endpoint)}`
    const state = await redis.get<CircuitBreakerState>(key)
    if (!state) return { failures: 0, lastFailure: 0, isOpen: false }
    // Auto-reset: if circuit is open but enough time has passed, allow a probe
    if (state.isOpen && Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_MS) {
      return { failures: 0, lastFailure: 0, isOpen: false }
    }
    return state
  } catch {
    return { failures: 0, lastFailure: 0, isOpen: false }
  }
}

async function recordFailure(hotelId: string, endpoint: string): Promise<CircuitBreakerState> {
  const redis = getRedis()
  if (!redis) return { failures: 0, lastFailure: 0, isOpen: false }
  try {
    const current = await getCircuitState(hotelId, endpoint)
    const newState: CircuitBreakerState = {
      failures: current.failures + 1,
      lastFailure: Date.now(),
      isOpen: current.failures + 1 >= CIRCUIT_BREAKER_THRESHOLD,
    }
    const key = `circuit:scidoo:${hotelId}:${endpointKey(endpoint)}`
    // TTL = 10 minutes (auto-cleanup)
    await redis.set(key, newState, { ex: 600 })
    return newState
  } catch {
    return { failures: 0, lastFailure: 0, isOpen: false }
  }
}

async function resetCircuit(hotelId: string, endpoint: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    const key = `circuit:scidoo:${hotelId}:${endpointKey(endpoint)}`
    await redis.del(key)
  } catch {
    // ignore
  }
}

/**
 * Check if ANY endpoint circuit breaker is open for a hotel.
 * Used by external health-check / sync-status services.
 */
export async function isAnyCircuitOpen(hotelId: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    const keys = await redis.keys(`circuit:scidoo:${hotelId}:*`)
    for (const key of keys) {
      const state = await redis.get<CircuitBreakerState>(key)
      if (state?.isOpen && Date.now() - state.lastFailure <= CIRCUIT_BREAKER_RESET_MS) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Decode HTML entities that Scidoo may return in string values.
 */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
}

/** Recursively decode HTML entities in all string values of an object/array */
function decodeDeep<T>(obj: T): T {
  if (typeof obj === "string") return decodeHtmlEntities(obj) as unknown as T
  if (Array.isArray(obj)) return obj.map(decodeDeep) as unknown as T

  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = decodeDeep(v)
    }
    return out as T
  }

  return obj
}

export interface ScidooConfig {
  apiKey: string
  propertyId?: string
  hotelId?: string // Used for circuit breaker key
}

export interface ScidooFiscalProductionResponse {
  invoices: ScidooInvoice[]
  fees: ScidooFee[]
  suspended_invoices: ScidooSuspendedInvoice[]
  deposits: ScidooDeposit[]
}

export interface ScidooInvoice {
  id: string
  document_date: string
  registration_date: string
  number: string
  id_number: string
  total: number
  fees: ScidooFee[]
  account_revenue: ScidooAccountRevenue[]
}

export interface ScidooFee {
  taxable: number
  vat_rate: string
  tax: number
  id: string
}

export interface ScidooAccountRevenue {
  code: string
  name: string
  value: number
}

export interface ScidooSuspendedInvoice {
  document_date: string
  registration_date: string
  number: string
  id_number: string
  total: number
}

export interface ScidooDeposit {
  description: string
  date: string
  id_number: string
  number: string
  document_name: string
  value: number
}

export class ScidooClient {

  private apiKey: string
  private propertyId?: string
  private hotelId: string

  constructor(config: ScidooConfig) {
    this.apiKey = config.apiKey
    this.propertyId = config.propertyId
    this.hotelId = config.hotelId || config.propertyId || "unknown"
  }

  /**
   * Endpoint che NON accettano property_id
   */
  private static readonly ENDPOINTS_WITHOUT_PROPERTY_ID = [
    "/rooms/getRoomTypes.php",
    "/rooms/getAvailability.php",
    "/rooms/getAvailabilityDetails.php",
    "/rooms/getMinstay.php",
    "/prices/getRates.php",
    "/prices/getPrices.php",
    "/guests/getGuestTypes.php",
    "/bookings/getBookings.php",
    "/bookings/getAvailability.php",
    "/services/getAvailability.php",
    "/invoice/getFiscalProduction.php",
  ]

  /**
   * Raw HTTP request to Scidoo (no retry/circuit breaker)
   */
  private async rawRequest<T>(endpoint: string, data?: any): Promise<T> {
    const url = `${SCIDOO_API_BASE_URL}${endpoint}`

    const payload = data ? { ...data } : {}

    const shouldInjectPropertyId =
      !ScidooClient.ENDPOINTS_WITHOUT_PROPERTY_ID.includes(endpoint)

    if (shouldInjectPropertyId && this.propertyId && !payload.property_id) {
      payload.property_id = Number(this.propertyId)
    }

    const safePayload = Object.keys(payload).length > 0 ? payload : undefined

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120_000) // 2 min timeout

    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": this.apiKey
        },
        body: safePayload ? JSON.stringify(safePayload) : undefined,
        signal: controller.signal,
      })
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        throw new Error(`[scidoo] ${endpoint} timeout after 120s`)
      }
      throw err
    }
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `[scidoo] ${endpoint} failed ${response.status}: ${errorText}`
      )
    }

    const responseText = await response.text()
    try {
      return decodeDeep(JSON.parse(responseText)) as T
    } catch {
      throw new Error(
        `[scidoo] ${endpoint} returned non JSON: ${responseText.substring(0,200)}`
      )
    }
  }

  /**
   * Generic Scidoo API request with retry + circuit breaker
   * - Retry: 3 attempts with exponential backoff (2s, 4s, 8s)
   * - Circuit breaker: opens after 5 consecutive failures, resets after 5 min
   */
  private async request<T>(endpoint: string, data?: any): Promise<T> {
    // Check circuit breaker for THIS specific endpoint
    const circuitState = await getCircuitState(this.hotelId, endpoint)
    if (circuitState.isOpen) {
      const minutesAgo = Math.round((Date.now() - circuitState.lastFailure) / 60000)
      throw new Error(
        `[scidoo] Circuit breaker OPEN for hotel ${this.hotelId} endpoint ${endpoint} (${circuitState.failures} failures, last ${minutesAgo}m ago). Skipping.`
      )
    }

    console.log("[scidoo] request", endpoint, data ? Object.keys(data) : "(no data)")

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.rawRequest<T>(endpoint, data)

        // Success: reset circuit breaker for this endpoint
        if (circuitState.failures > 0) {
          await resetCircuit(this.hotelId, endpoint)
        }

        return result
      } catch (err: any) {
        lastError = err
        console.error(`[scidoo] Attempt ${attempt}/${MAX_RETRIES} failed for ${endpoint}:`, err.message)

        if (attempt < MAX_RETRIES) {
          const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1) // 2s, 4s, 8s
          console.log(`[scidoo] Retrying in ${delayMs}ms...`)
          await sleep(delayMs)
        }
      }
    }

    // All retries exhausted: record failure for THIS endpoint
    const newState = await recordFailure(this.hotelId, endpoint)
    if (newState.isOpen) {
      console.error(`[scidoo] Circuit breaker TRIPPED for hotel ${this.hotelId} endpoint ${endpoint} after ${newState.failures} consecutive failures`)

      // Fire-and-forget: send throttled email alert (don't block the request)
      import("@/lib/services/email-service").then(({ emailService }) => {
        emailService.sendAlertIfNotRecent({
          alertType: `circuit_breaker_open:${endpointKey(endpoint)}`,
          hotelId: this.hotelId,
          summary: `Circuit breaker aperto per endpoint ${endpoint} dopo ${newState.failures} fallimenti consecutivi`,
          details: [
            `Endpoint fallito: ${endpoint}`,
            `Ultimo errore: ${lastError?.message || "sconosciuto"}`,
            `Questo endpoint sara bloccato per 5 minuti. Gli altri endpoint continuano a funzionare.`,
          ],
        }).catch(err => console.error("[scidoo] Failed to send circuit breaker alert email:", err))
      }).catch(() => { /* dynamic import failed, ignore */ })
    }

    throw lastError!
  }

  /**
   * Account info
   */
  async getAccountInfo() {
    return this.request<{
      name: string
      email: string
      website: string
      account_id: string
      properties: Array<{ id: number; name: string }>
    }>("/account/getInfo.php")
  }

  /**
   * Prenotazioni
   */
  async getBookings(params: {
    checkin_from?: string
    checkin_to?: string
    stay_from?: string
    stay_to?: string
    modified_from?: string
    modified_to?: string
    last_modified?: boolean
    property_id?: number
  }) {

    return this.request<{
      count: number
      reservations: any[]
    }>("/bookings/get.php", params)

  }

  /**
   * Room types
   */
  async getRoomTypes(params?: { language?: string; room_type_id?: number }) {
    return this.request<any[]>("/rooms/getRoomTypes.php", params || {})
  }

  /**
   * Availability
   */
  async getAvailability(params: {
    start_date: string
    end_date: string
  }) {

    return this.request<{
      availability: any[]
    }>("/rooms/getAvailability.php", params)

  }

  /**
   * Guest types
   */
  async getGuestTypes() {
    return this.request<any[]>("/guests/getGuestTypes.php")
  }

  /**
   * Rates
   */
  async getRates() {
    return this.request<any[]>("/prices/getRates.php", {})
  }

  /**
   * Min stay
   */
  async getMinStay(params: { start_date: string; end_date: string }) {
    return this.request<any>("/rooms/getMinstay.php", params)
  }

  /**
   * PRODUZIONE FISCALE
   *
   * BUG FIX 15/05/2026 (incident "fiscal silente Barronci dal 13/05"):
   * Tutti i caller del codebase (cron sync-modules, admin/fiscal-resync,
   * scripts/trigger-scidoo-sync, api/debug/*) chiamano questo metodo
   * POSITIONAL con (dateFrom, dateTo, vatNumber). La vecchia firma
   * `(params: {from, to, vat_number})` riceveva la STRINGA dateFrom come
   * params, JSON.stringify produceva body `"2026-05-01"` → Scidoo
   * rispondeva senza dati → tax_documents=[] → 0 righe in
   * connectors.scidoo_raw_fiscal_production. Bug silenzioso (no throw,
   * solo response vuota). Allineato a `lib/connectors/scidoo/client.ts`
   * che gia' usava positional. Inoltre normalizziamo il response shape
   * a `tax_documents` (con fallback su `invoices`) come fanno tutti i
   * caller downstream.
   */
  async getFiscalProduction(
    dateFrom: string,
    dateTo: string,
    vatNumber: string,
  ): Promise<{
    tax_documents: any[]
    fees: any[]
    suspended_invoices: any[]
    deposits: any[]
  }> {
    // Italian VAT numbers (Partita IVA) are 11 digits and can have leading
    // zeros — keep as string (parseInt would lose them).
    let data: any
    try {
      data = await this.request<any>(
        "/invoice/getFiscalProduction.php",
        {
          from: dateFrom,
          to: dateTo,
          vat_number: vatNumber,
        },
      )
    } catch (err: any) {
      // Scidoo on EMPTY date ranges (e.g. future weeks) returns a non-OK
      // status with `{"message":"no documents found"}` instead of `200 +
      // []`. Treat that pattern as "empty result" so weekly chunking on
      // ranges that include future days doesn't pollute `records_failed`
      // (Barronci 17/05/2026 manual sync: 2 falsi errori sui chunk
      // 21-27/05 e 28-31/05, range mai esistito su Scidoo).
      const msg = String(err?.message || "")
      const looksLikeEmpty =
        msg.includes("no documents found") ||
        msg.includes("nessun documento") ||
        // Scidoo may return 400 or 404 for empty windows depending on endpoint.
        /failed (400|404):.*\{.*message/i.test(msg)
      if (looksLikeEmpty) {
        console.log(
          `[scidoo] getFiscalProduction ${dateFrom}..${dateTo}: no documents found (treated as empty)`,
        )
        return { tax_documents: [], fees: [], suspended_invoices: [], deposits: [] }
      }
      throw err
    }

    return {
      tax_documents: data?.tax_documents ?? data?.invoices ?? [],
      fees: data?.fees ?? [],
      suspended_invoices: data?.suspended_invoices ?? [],
      deposits: data?.deposits ?? [],
    }
  }
}
