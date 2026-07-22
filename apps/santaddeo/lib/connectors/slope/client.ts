/**
 * Slope Partner API client (v1).
 *
 * Endpoints usati:
 *  - GET  /v1/establishment                 (ping / identita' struttura)
 *  - GET  /v1/lodging-types                 (tipologie camera, paginate)
 *  - GET  /v1/rate-plans                    (piani tariffari, paginati)
 *  - GET  /v1/lodging-reservations          (prenotazioni, paginate + filtri)
 *  - POST /v1/deleted-resources             (riconciliazione eliminati)
 *  - POST /v1/lodging-types/{id}/rates-and-availability-updates (push tariffe)
 *
 * Auth: `Authorization: bearer <token>`; il token e' PER STRUTTURA (non
 * esiste un property_id separato). 401 = token invalido/revocato.
 *
 * Rate limit: 30 req/min globali per partner + 5 req/min per struttura
 * sull'endpoint di rate update. Il client gestisce 429 con retry esponenziale
 * (a differenza di BRiG, il limite Slope e' per-minuto: il retry HA senso).
 */

import type {
  SlopeConfig,
  SlopeDeletedResourceType,
  SlopeEstablishment,
  SlopeLodgingType,
  SlopePaginatedResponse,
  SlopeRatePlan,
  SlopeRatesAndAvailabilityPayload,
  SlopeReservation,
  SlopeReservationExpand,
  SlopeSingleResponse,
} from "./types"

export class SlopeError extends Error {
  status: number
  body: string
  /** `code` dal body errore Slope, se parsabile. */
  slopeCode: string | null
  constructor(status: number, body: string, message?: string) {
    super(message ?? `Slope API error ${status}: ${body.slice(0, 200)}`)
    this.name = "SlopeError"
    this.status = status
    this.body = body
    this.slopeCode = null
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed.code === "string") this.slopeCode = parsed.code
    } catch {
      /* body non JSON */
    }
  }
}

export const SLOPE_PROD_BASE_URL = "https://api.slope.it"
export const SLOPE_STAGING_BASE_URL = "https://api.staging.slope.it"

function normalizeBaseUrl(url: string): string {
  return (url || "").trim().replace(/\/+$/, "")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attempt: number): number {
  // 1s, 3s, 9s: il rate limit Slope e' per minuto, backoff piu' generoso dei 500ms BRiG.
  return 1000 * Math.pow(3, attempt - 1)
}

export class SlopeClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(config: SlopeConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl) || SLOPE_PROD_BASE_URL
    this.apiKey = (config.apiKey || "").trim()
    if (!this.apiKey) throw new Error("SlopeClient: apiKey is required")
  }

  private headers(hasBody: boolean): HeadersInit {
    const h: Record<string, string> = {
      Authorization: `bearer ${this.apiKey}`,
      Accept: "application/json",
    }
    if (hasBody) h["Content-Type"] = "application/json"
    return h
  }

  /**
   * Request con retry esponenziale su 429/5xx/network (max 4 tentativi).
   * Monitora l'header di deprecazione `Slope-EndpointSunsetDate` e lo logga:
   * Slope garantisce 6 mesi di preavviso, ma senza log non lo vedremmo mai.
   */
  private async request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v))
      }
    }

    const hasBody = options.body !== undefined
    const maxAttempts = 4
    let lastErr: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const init: RequestInit = {
        method,
        headers: this.headers(hasBody),
        signal: AbortSignal.timeout(30_000),
      }
      if (hasBody) init.body = JSON.stringify(options.body)

      try {
        const res = await fetch(url.toString(), init)

        const sunset = res.headers.get("Slope-EndpointSunsetDate")
        if (sunset) {
          console.warn(`[slope] DEPRECATION: ${method} ${path} sunset il ${sunset}. Migrare prima di quella data.`)
        }

        // 429 (30 req/min partner o 5 req/min rate updates): retry con backoff.
        // 5xx: transitorio lato Slope, retry.
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          await sleep(backoffMs(attempt))
          continue
        }
        return res
      } catch (err) {
        lastErr = err
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt))
          continue
        }
        throw err
      }
    }
    throw lastErr ?? new Error("SlopeClient: request failed after retries")
  }

  private async json<T>(res: Response): Promise<T> {
    const text = await res.text()
    if (!res.ok) throw new SlopeError(res.status, text)
    if (!text) return {} as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new SlopeError(res.status, text, `Slope API: risposta non-JSON (status ${res.status})`)
    }
  }

  /** GET /v1/establishment — usato come ping/test connessione. */
  async getEstablishment(): Promise<SlopeEstablishment> {
    const res = await this.request("GET", "/v1/establishment")
    const body = await this.json<SlopeSingleResponse<SlopeEstablishment>>(res)
    return body.data
  }

  /** GET /v1/lodging-types — tutte le pagine. */
  async getLodgingTypes(options: { expand?: Array<"ratePlans" | "lodgings"> } = {}): Promise<SlopeLodgingType[]> {
    return this.getAllPages<SlopeLodgingType>("/v1/lodging-types", {
      expand: options.expand?.join(","),
    })
  }

  /** GET /v1/rate-plans — tutte le pagine. */
  async getRatePlans(options: { expand?: Array<"lodgingTypes" | "profitCenterAllocations"> } = {}): Promise<
    SlopeRatePlan[]
  > {
    return this.getAllPages<SlopeRatePlan>("/v1/rate-plans", {
      expand: options.expand?.join(","),
    })
  }

  /**
   * GET /v1/lodging-reservations — UNA pagina.
   * Filtri in formato Slope, es. ["lastUpdateDate:gt:2026-07-01T00:00:00+00:00"].
   * IMPORTANTE (doc Slope, Strategia 1): quando si filtra per lastUpdateDate
   * NON aggiungere altri filtri, o si perdono aggiornamenti.
   */
  async getReservationsPage(options: {
    page?: number
    filter?: string[]
    expand?: SlopeReservationExpand[]
  } = {}): Promise<SlopePaginatedResponse<SlopeReservation>> {
    const res = await this.request("GET", "/v1/lodging-reservations", {
      query: {
        page: options.page ?? 1,
        filter: options.filter?.join(","),
        expand: options.expand?.join(","),
      },
    })
    const body = await this.json<SlopePaginatedResponse<SlopeReservation>>(res)
    return {
      pagination: body.pagination ?? { hasNextPage: false },
      data: (body.data ?? []).map(normalizeReservation),
    }
  }

  /**
   * POST /v1/deleted-resources — dato un set di id nel nostro storage,
   * ritorna quelli ELIMINATI su Slope (hard delete). Max prudenziale di
   * 500 id per chiamata (chunking a carico del chiamante o via helper sync).
   */
  async getDeletedResources(ids: string[], type: SlopeDeletedResourceType): Promise<string[]> {
    if (ids.length === 0) return []
    const res = await this.request("POST", "/v1/deleted-resources", {
      body: { ids, type },
    })
    return this.json<string[]>(res)
  }

  /**
   * POST /v1/lodging-types/{lodgingTypeId}/rates-and-availability-updates
   * Push prezzi/chiusure. Risposta 202 = accettato (elaborazione asincrona).
   * Limiti: max 500 giorni-update per richiesta, 5 richieste/min per struttura
   * (il retry 429 del client gestisce lo sforamento).
   */
  async postRatesAndAvailabilityUpdates(
    lodgingTypeId: string,
    payload: SlopeRatesAndAvailabilityPayload,
  ): Promise<void> {
    const res = await this.request(
      "POST",
      `/v1/lodging-types/${encodeURIComponent(lodgingTypeId)}/rates-and-availability-updates`,
      { body: payload },
    )
    if (!res.ok) {
      const text = await res.text()
      throw new SlopeError(res.status, text)
    }
    // 202: body vuoto o non interessante, drena per liberare il socket.
    await res.text().catch(() => {})
  }

  /** Helper: pagina automaticamente un endpoint lista fino a esaurimento. */
  private async getAllPages<T>(
    path: string,
    query: Record<string, string | undefined>,
    maxPages = 50,
  ): Promise<T[]> {
    const out: T[] = []
    let page = 1
    for (; page <= maxPages; page++) {
      const res = await this.request("GET", path, { query: { ...query, page } })
      const body = await this.json<SlopePaginatedResponse<T>>(res)
      out.push(...(body.data ?? []))
      if (!body.pagination?.hasNextPage) break
    }
    return out
  }
}

/**
 * Normalizza le divergenze note della response Slope:
 * la sandbox ritorna il typo `isOvebooking` invece di `isOverbooking`
 * (verificato live 13/07/2026). Teniamo entrambi per robustezza.
 */
function normalizeReservation(r: SlopeReservation & { isOvebooking?: boolean }): SlopeReservation {
  if (r.isOverbooking === undefined && typeof r.isOvebooking === "boolean") {
    r.isOverbooking = r.isOvebooking
  }
  return r
}
