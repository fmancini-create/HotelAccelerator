// Scidoo PMS API Client
// Handles all communication with Scidoo API endpoints

import type {
  ScidooConfig,
  ScidooBooking,
  ScidooAvailability,
  ScidooRate,
  ScidooFiscalProduction,
  ScidooRoomType,
  ScidooMinStay,
} from "../types"

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calcola quanto attendere prima di ritentare una risposta 429, in ms.
 * Priorita': header `Retry-After` (secondi) -> messaggio nel body
 * ("Rate limit exceeded. Retry after N seconds.") -> default 3s.
 * Il cap (capMs) e' configurabile per-istanza per non sforare il budget di
 * timeout delle function serverless.
 */
function parseRetryAfterMs(response: Response, body: string, capMs: number): number {
  const header = response.headers.get("retry-after")
  let seconds = header ? Number(header) : Number.NaN
  if (!Number.isFinite(seconds)) {
    const m = body.match(/retry after\s+(\d+)\s*second/i)
    if (m) seconds = Number(m[1])
  }
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 3
  // Aggiungiamo 1s di margine al valore chiesto da Scidoo (i loro contatori
  // sono al secondo: ritentare "esattamente" allo scadere a volte becca ancora
  // 429). Poi applichiamo il cap per-istanza.
  return Math.min((seconds + 1) * 1000, capMs)
}

// Default STORICI (pensati per il PUSH): cap attesa 12s, 3 tentativi. Con il
// lock di concorrenza per-hotel i 429 sul push sono rari e un cap alto rischia
// il 504 dentro maxDuration. Il SYNC in lettura (sync-and-etl, maxDuration=300)
// invece PUO' e DEVE attendere il Retry-After reale di Scidoo (25-50s), altrimenti
// il fetch disponibilita' fallisce a vuoto e la disponibilita' resta stale.
const DEFAULT_MAX_RETRY_WAIT_MS = 12000
const DEFAULT_MAX_ATTEMPTS = 3

export class ScidooClient {
  private baseUrl: string
  private apiKey: string
  private propertyId: string
  private maxRetryWaitMs: number
  private maxAttempts: number

  constructor(config: ScidooConfig | Record<string, any>) {
    // Accept both snake_case (ScidooConfig) and camelCase property names
    this.baseUrl = (config as any).endpoint_url || (config as any).endpointUrl || "https://www.scidoo.com/api/v1"
    this.apiKey = (config as any).api_key || (config as any).apiKey || ""
    this.propertyId = (config as any).property_id || (config as any).propertyId || ""
    // Retry 429 configurabile per-istanza (vedi DEFAULT_* sopra). Il sync in
    // lettura passa un cap piu' alto per rispettare il Retry-After di Scidoo.
    const cfgWait = Number((config as any).maxRetryWaitMs ?? (config as any).max_retry_wait_ms)
    const cfgAttempts = Number((config as any).maxAttempts ?? (config as any).max_attempts)
    this.maxRetryWaitMs = Number.isFinite(cfgWait) && cfgWait > 0 ? cfgWait : DEFAULT_MAX_RETRY_WAIT_MS
    this.maxAttempts = Number.isFinite(cfgAttempts) && cfgAttempts > 0 ? cfgAttempts : DEFAULT_MAX_ATTEMPTS

    if (!this.apiKey) {
      console.error("[ScidooClient] WARNING: api_key is missing! Config keys:", Object.keys(config))
    }
    if (!this.propertyId) {
      console.error("[ScidooClient] WARNING: property_id is missing! Config keys:", Object.keys(config))
    }
  }

  /**
   * Endpoints that DO NOT accept property_id in the request.
   * Per Scidoo docs: these endpoints use the property associated with the API Key.
   *
   * NOTE: /prices/setDayPrices.php is in this list. Scidoo's strict validator
   * rejects any extra parameter (including property_id in the body) with
   * "400 invalid_parameter (property_id)". This matches the working AppsScript
   * implementation used as reference: only Api-Key header + { prices: [...] }
   * body are sent; property_id is inferred from the API Key.
   */
  private static readonly ENDPOINTS_WITHOUT_PROPERTY_ID = [
    "/rooms/getRoomTypes.php",
    "/rooms/getAvailability.php",
    "/rooms/getAvailabilityDetails.php",
    "/rooms/getMinstay.php",
    "/prices/getRates.php",
    "/prices/getPrices.php",
    // FIX 05/06/2026: il read-back post-push usa `/prices/getDayPrices.php`
    // (endpoint reale dal fix 01/06), che come setDayPrices RIFIUTA property_id
    // con "400 invalid_parameter (property_id)". La whitelist aveva solo il
    // vecchio nome `getPrices.php` -> getDayPrices riceveva property_id iniettato
    // e la verifica post-push falliva sistematicamente (non-blocking ma rumorosa).
    "/prices/getDayPrices.php",
    "/prices/setDayPrices.php",
    "/guests/getGuestTypes.php",
    "/bookings/get.php",
    "/bookings/getAvailability.php",
    "/services/getAvailability.php",
    "/invoice/getFiscalProduction.php",
  ]

  private async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)

    // Build body with params (Scidoo expects POST with JSON body, NOT query params)
    // Preserves native types (boolean, number) for correct JSON serialization
    const body: Record<string, any> = { ...params }
    
    // Only add property_id for endpoints that support it.
    // Scidoo expects property_id as NUMERIC (integer), not string. Sending it
    // as a string triggers "400 invalid_parameter (property_id)" on strict
    // endpoints like /prices/setDayPrices.php.
    const shouldAddPropertyId = !ScidooClient.ENDPOINTS_WITHOUT_PROPERTY_ID.includes(endpoint)
    if (shouldAddPropertyId && this.propertyId) {
      const numericPropertyId = typeof this.propertyId === "string"
        ? parseInt(this.propertyId, 10)
        : this.propertyId
      body.property_id = Number.isFinite(numericPropertyId) ? numericPropertyId : this.propertyId
    }

    console.log(`[ScidooClient] POST ${endpoint}`, { body: Object.keys(body).length > 0 ? body : "(empty)" })

    // RATE LIMIT (FIX 02/07/2026): Scidoo risponde 429 "Too Many Requests"
    // quando arrivano troppe richieste ravvicinate (es. push di prezzi su molti
    // giorni -> molti batch). Prima il 429 diventava un errore secco e il batch
    // veniva perso ("Errore invio PMS" rosso in griglia). Ora rispettiamo il
    // Retry-After e ritentiamo un numero limitato di volte.
    // FIX 04/07/2026: 4 -> 3 tentativi. Col lock i 429 sono rari; worst-case
    // per richiesta ora ~2×12s = 24s invece di 3×30s = 90s -> niente 504.
    // FIX 20/07/2026: tentativi e cap attesa ora configurabili per-istanza
    // (il sync in lettura ne usa di piu' per rispettare il Retry-After reale).
    const maxAttempts = this.maxAttempts
    let response!: Response
    let responseText = ""
    let contentType = ""
    for (let attempt = 1; ; attempt++) {
      response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Api-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      })

      responseText = await response.text()
      contentType = response.headers.get("content-type") || ""
      console.log(`[ScidooClient] Response ${response.status} for ${endpoint}:`, responseText.substring(0, 500))

      if (response.status === 429 && attempt < maxAttempts) {
        const waitMs = parseRetryAfterMs(response, responseText, this.maxRetryWaitMs)
        console.warn(
          `[ScidooClient] 429 rate limit on ${endpoint} (tentativo ${attempt}/${maxAttempts}). ` +
            `Attendo ${waitMs}ms e ritento.`,
        )
        await sleep(waitMs)
        continue
      }
      break
    }

    if (!response.ok) {
      throw new Error(`Scidoo API error: ${response.status} ${response.statusText} - ${responseText}`)
    }

    // FIX 15/05/2026: Scidoo a volte risponde HTTP 200 con body VUOTO sul
    // endpoint /invoice/getFiscalProduction.php quando non ci sono documenti
    // nel periodo richiesto (regression lato Scidoo: prima restituivano
    // {tax_documents:[]} come JSON valido). Prima questo faceva crashare
    // l'intero sync con "Scidoo API returned non-JSON: " e bloccava la
    // scrittura in connectors.scidoo_raw_fiscal_production -> monitor
    // health "fiscal_broken" giornaliero (Barronci 13-15/05).
    // Tolleriamo body vuoto: log warn + return {} per lasciare ai chiamanti
    // l'interpretazione "nessun dato". Se Scidoo ha davvero un problema
    // server-side risponderebbe non-2xx (gestito sopra) oppure HTML/error
    // string non vuoto (gestito sotto con throw + log di status/content-type
    // per debug).
    if (responseText.trim() === "") {
      // FIX 17/05/2026: downgrade da `console.warn` a `console.log`.
      // Lo scenario "200 + body vuoto" e' diventato il normal operating mode
      // del nuovo Scidoo per range vuoti su /invoice/getFiscalProduction.php
      // (es. sync incrementale daily su hotel senza vendite oggi). Generava
      // ~50 warn/giorno costanti che inquinavano il feed errori senza alcuna
      // azione possibile. La logica downstream (fetchChunkWithRetry +
      // fetchAsDaily in scidoo-sync-service) tratta correttamente l'empty
      // come 0 docs e ritenta su range >= 2gg, dove e' davvero sospetto.
      console.log(
        `[ScidooClient] Empty body on ${endpoint} (status ${response.status}, ` +
          `content-type "${contentType}"). Treating as empty result.`,
      )
      return {} as T
    }

    try {
      return JSON.parse(responseText)
    } catch {
      // Log esteso (status, content-type, primi 200 char) per diagnosticare
      // futuri casi in cui Scidoo restituisce HTML/error string anziche' JSON.
      console.error(
        `[ScidooClient] Non-JSON response on ${endpoint}: status=${response.status}, ` +
          `content-type="${contentType}", body[0..200]=${JSON.stringify(responseText.substring(0, 200))}`,
      )
      throw new Error(`Scidoo API returned non-JSON: ${responseText.substring(0, 200)}`)
    }
  }

  /**
   * Get bookings with flexible filtering options
   * @param options - Filter options:
   *   - checkin_from/checkin_to: Filter by check-in date range
   *   - modified_from/modified_to: Filter by last modification date
   *   - last_modified: true to get all bookings created/modified since last request
   *   - stay_from/stay_to: Filter by stay date range
   */
  async getBookings(options: {
    checkin_from?: string
    checkin_to?: string
    modified_from?: string
    modified_to?: string
    last_modified?: boolean
    stay_from?: string
    stay_to?: string
  }): Promise<{ count: number; reservations: ScidooBooking[] }> {
  // FIX 30/04/2026 (post-incident "no bookings imported today"):
  // Cambiato tipo da `Record<string, string>` a `Record<string, any>` perche'
  // Scidoo richiede `last_modified` come boolean JSON nativo (true/false), NON
  // come stringa "true". Il request method serializza il body con
  // JSON.stringify, quindi `params.last_modified = "true"` finiva nel body
  // come `{"last_modified": "true"}` (stringa), e Scidoo rispondeva
  // 400 "invalid boolean (last_modified=<true>)". Da ieri sera questo bug
  // bloccava l'incremental sync per TUTTI gli hotel Scidoo, lasciando i raw
  // fermi al 29/04 17:30. Ora passiamo il boolean nativo.
  const params: Record<string, any> = {}

  if (options.checkin_from) params.checkin_from = options.checkin_from
  if (options.checkin_to) params.checkin_to = options.checkin_to
  if (options.modified_from) params.modified_from = options.modified_from
  if (options.modified_to) params.modified_to = options.modified_to
  if (options.last_modified) params.last_modified = true
  if (options.stay_from) params.stay_from = options.stay_from
  if (options.stay_to) params.stay_to = options.stay_to
    
    const data = await this.request<{ count: number; reservations: ScidooBooking[] }>("/bookings/get.php", params)
    return { count: data.count || 0, reservations: data.reservations || [] }
  }

  async getAvailability(dateFrom: string, dateTo: string): Promise<ScidooAvailability[]> {
  const data = await this.request<{ availability: ScidooAvailability[] }>("/rooms/getAvailability.php", {
  start_date: dateFrom,
  end_date: dateTo,
  })
    return data.availability || []
  }

  // NOTA (20/07/2026): `/prices/getRates.php` restituisce il CATALOGO dei piani
  // tariffari (definizioni), NON prezzi per-giorno, e NON accetta parametri
  // data: inviando `date_from`/`date_to` Scidoo risponde
  // "400 invalid_parameter (date_from)". Il client legacy
  // (lib/services/scidoo-client.ts) infatti invia body vuoto `{}` e funziona.
  // Manteniamo la firma (i chiamanti passano ancora un range) ma i parametri
  // sono ignorati: si invia body vuoto. La property e' inferita dall'Api-Key
  // (endpoint gia' in ENDPOINTS_WITHOUT_PROPERTY_ID).
  async getRates(_dateFrom?: string, _dateTo?: string): Promise<ScidooRate[]> {
    const data = await this.request<{ rates: ScidooRate[] }>("/prices/getRates.php", {})
    return data.rates || []
  }

  async getRoomTypes(): Promise<ScidooRoomType[]> {
    const data = await this.request<{ room_types: ScidooRoomType[] }>("/rooms/getRoomTypes.php")
    return data.room_types || []
  }

  /**
   * Min stay / restrizioni di soggiorno.
   *
   * FIX 21/07/2026: `/rooms/getMinstay.php` NON restituisce un array piatto
   * `{ minstay: [...] }` (come si assumeva) ma una struttura ANNIDATA:
   *   { results: [ { room_type_id, rate_list: {
   *       "<rateId>": { rate_id, dates: [ { date, minstay, cta, ctd } ] } } } ] }
   * dove `minstay` e' una STRINGA ("7") e cta/ctd sono stringhe "0"/"1".
   * La vecchia lettura `data.minstay` era sempre undefined -> `[]` -> log
   * "fetched 0 minstay records" nonostante la response contenesse i dati.
   * Qui appiattiamo alla forma `ScidooMinStay[]` che tutti i chiamanti
   * (connettore sync.ts, ScidooSyncService, test-endpoints) gia' si aspettano.
   * Manteniamo un fallback sul vecchio shape piatto per sicurezza.
   */
  async getMinStay(dateFrom: string, dateTo: string): Promise<ScidooMinStay[]> {
    const data = await this.request<{ results?: any[]; minstay?: ScidooMinStay[] }>(
      "/rooms/getMinstay.php",
      { start_date: dateFrom, end_date: dateTo },
    )

    // Fallback: se un giorno Scidoo tornasse davvero l'array piatto.
    if (Array.isArray(data?.minstay)) return data.minstay

    const toBool = (v: unknown): boolean => v === true || v === 1 || v === "1"
    const flat: ScidooMinStay[] = []

    for (const rt of data?.results ?? []) {
      const roomTypeId = rt?.room_type_id
      const rateList = (rt?.rate_list ?? {}) as Record<string, any>
      for (const rateKey of Object.keys(rateList)) {
        const rateEntry = rateList[rateKey]
        const rateId = rateEntry?.rate_id ?? rateKey
        for (const d of rateEntry?.dates ?? []) {
          if (!d?.date) continue
          const ms = Number(d.minstay)
          flat.push({
            room_type_id: roomTypeId,
            rate_id: rateId,
            date: d.date,
            minstay: Number.isFinite(ms) ? ms : 0,
            cta: toBool(d.cta),
            ctd: toBool(d.ctd),
          })
        }
      }
    }

    return flat
  }

  /**
   * Set day prices on Scidoo PMS
   * POST /prices/setDayPrices.php
   * Body: { prices: [{ room_type_id, price_id, occupancy?, day_price, from, to }] }
   *
   * STRICT SUCCESS POLICY (FIX 30/04/2026):
   * In passato Scidoo poteva rispondere con `{}` vuoto, `{message:"..."}`,
   * o `{success: undefined}` per payload "accettati ma non applicati"
   * (es. tariffa non valida per quella camera, periodo bloccato, parametri
   * silently ignored). Il vecchio codice ritornava `success: result.success !== false`
   * trattando questi casi come successo. Risultato: l'app diceva "tutto ok"
   * ma su Scidoo i prezzi non comparivano.
   *
   * Ora richiediamo `success === true` ESPLICITO. Qualsiasi altra forma di
   * response viene loggata e considerata fallimento, con il payload completo
   * incluso nell'eccezione per debug rapido.
   *
   * Inoltre:
   *  - normalizziamo `from`/`to` a YYYY-MM-DD (non ISO con T)
   *  - copriamo `errors[]`, `failed`, `skipped` se presenti nelle response
   */
  async setDayPrices(
    prices: {
      room_type_id: number
      price_id: number
      occupancy?: number
      day_price: number
      from: string
      to: string
    }[]
  ): Promise<{ success: boolean; processed: number; rawResult: unknown }> {
    console.log(`[v0] [ScidooClient.setDayPrices] Sending ${prices.length} prices via request()`)
    if (prices.length > 0) {
      console.log(`[v0] [ScidooClient.setDayPrices] Sample price:`, JSON.stringify(prices[0]))
    }

    // setDayPrices.php is in ENDPOINTS_WITHOUT_PROPERTY_ID: the property is
    // inferred from the Api-Key header; including property_id in the body
    // triggers a 400 invalid_parameter error on Scidoo's strict validator.
    const result = await this.request<{
      success?: boolean
      error?: string
      message?: string
      errors?: unknown[]
      failed?: number
      skipped?: number
    }>("/prices/setDayPrices.php", { prices })

    console.log(`[v0] [ScidooClient.setDayPrices] Result:`, JSON.stringify(result))

    // Reject explicit error responses up front (Scidoo conventionally puts
    // both an `error` code and a `message` string in failure responses).
    if (result.error) {
      throw new Error(`Scidoo setDayPrices error: ${result.error} - ${result.message || ""}`)
    }

    // STRICT: require explicit success === true. Anything else is treated
    // as a non-applied push, even if the HTTP status was 200.
    if (result.success !== true) {
      throw new Error(
        `Scidoo setDayPrices did NOT confirm success. Response: ${JSON.stringify(result)}`,
      )
    }

    // If Scidoo reports per-record failures via failed/skipped/errors[],
    // surface them: a partial success is still a failure for our purposes
    // (we'd be silently dropping a portion of the batch).
    const partialFail = (result.failed ?? 0) > 0 || (result.skipped ?? 0) > 0
      || (Array.isArray(result.errors) && result.errors.length > 0)
    if (partialFail) {
      throw new Error(
        `Scidoo setDayPrices reported partial failure: failed=${result.failed ?? 0} ` +
        `skipped=${result.skipped ?? 0} errors=${JSON.stringify(result.errors ?? [])}`,
      )
    }

    return { success: true, processed: prices.length, rawResult: result }
  }

  /**
   * Get prices from Scidoo for a date range. Used post-push to verify that
   * the prices we just sent are actually applied on the PMS side.
   * POST /prices/getPrices.php
   */
  /**
   * Read back day prices from Scidoo (used for post-push verification).
   *
   * FIX 01/06/2026: l'endpoint reale e' `/prices/getDayPrices.php` (NON
   * `getPrices.php`, che non esiste e cade sulla homepage marketing di Scidoo
   * restituendo HTML 200 -> JSON parse error). I parametri sono `start_date`/
   * `end_date` (come setDayPrices), NON `date_from`/`date_to`, e NON accetta
   * `property_id` (risponde 400 invalid_parameter).
   *
   * La response e' annidata:
   *   { prices: [ { room_type_id, room_rates: [ { rate_id,
   *       date_list: [ { date, price, occupancy } ] } ] } ] }
   * La appiattiamo nella forma piatta che la verifica post-push si aspetta,
   * mappando `rate_id` -> `price_id` (stesso ID usato in push da setDayPrices).
   */
  async getPrices(
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{
    room_type_id: number | string
    price_id: number | string
    occupancy?: number
    day_price: number | string
    from: string
    to: string
    date?: string
  }>> {
    const data = await this.request<{ prices?: any[] }>("/prices/getDayPrices.php", {
      start_date: dateFrom,
      end_date: dateTo,
    })

    const flat: Array<{
      room_type_id: number | string
      price_id: number | string
      occupancy?: number
      day_price: number | string
      from: string
      to: string
      date?: string
    }> = []

    for (const rt of data?.prices ?? []) {
      const roomTypeId = rt?.room_type_id
      for (const rate of rt?.room_rates ?? []) {
        const rateId = rate?.rate_id
        for (const d of rate?.date_list ?? []) {
          if (!d?.date) continue
          flat.push({
            room_type_id: roomTypeId,
            price_id: rateId,
            occupancy: d.occupancy != null ? Number(d.occupancy) : undefined,
            day_price: d.price,
            from: d.date,
            to: d.date,
            date: d.date,
          })
        }
      }
    }

    return flat
  }

  async getFiscalProduction(
    dateFrom: string,
    dateTo: string,
    vatNumber: string
  ): Promise<{
    tax_documents: any[]
    fees: any[]
    suspended_invoices: any[]
    deposits: any[]
  }> {
    // Italian VAT numbers (Partita IVA) are 11 digits and can have leading zeros
    // Keep as string to preserve leading zeros - parseInt would lose them
    const data = await this.request<any>("/invoice/getFiscalProduction.php", {
      from: dateFrom,
      to: dateTo,
      vat_number: vatNumber,
    })
    return {
      tax_documents: data?.tax_documents ?? data?.invoices ?? [],
      fees: data?.fees ?? [],
      suspended_invoices: data?.suspended_invoices ?? [],
      deposits: data?.deposits ?? [],
    }
  }
}
