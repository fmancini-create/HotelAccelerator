/**
 * BRiG API client (spike).
 *
 * Wraps the four endpoints we care about for the spike:
 *   - POST /api/ext/reservations/daily-occupancy-filters  (paginated reservations)
 *   - GET  /api/nol/roomtypes/list?sid=...                (room types)
 *   - GET  /api/nol/rateplans/list?sid=...                (rate plans)
 *   - PUT  /api/nol/rates/update/{sid}                    (push rates) — non usato qui
 *
 * Auth: header `x-api-key`. The structureId travels in the body (POST) or
 * as `sid` query parameter (GET).
 *
 * See docs/brig/README.md for the full overview.
 */

import type {
  BrigConfig,
  BrigPaginatedReservations,
  BrigRatePlan,
  BrigRateUpdateItem,
  BrigRateUpdateResponse,
  BrigRoomType,
} from "./types"

export class BrigError extends Error {
  status: number
  body: string
  constructor(status: number, body: string, message?: string) {
    super(message ?? `Brig API error ${status}: ${body.slice(0, 200)}`)
    this.name = "BrigError"
    this.status = status
    this.body = body
  }
}

export class BrigClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly structureId: string

  constructor(config: BrigConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl)
    this.apiKey = config.apiKey
    this.structureId = config.structureId
    if (!this.baseUrl) throw new Error("BrigClient: baseUrl is required")
    if (!this.apiKey) throw new Error("BrigClient: apiKey is required")
    if (!this.structureId) throw new Error("BrigClient: structureId is required")
  }

  /**
   * Headers per la richiesta. `Content-Type` viene impostato solo quando c'è un
   * body (POST/PUT): inviarlo su GET può far rispondere 500 ad alcuni gateway
   * (vedi spike 26/04/2026 sull'endpoint `/api/nol/roomtypes/list`).
   */
  private headers(hasBody: boolean): HeadersInit {
    const h: Record<string, string> = {
      "x-api-key": this.apiKey,
      Accept: "application/json",
    }
    if (hasBody) h["Content-Type"] = "application/json"
    return h
  }

  /**
   * Esegue una request con retry esponenziale per errori transitori (5xx, 429, network).
   * Ritorna lo `Response` grezzo per dare al chiamante massimo controllo (può leggere status, headers, ecc).
   *
   * 429 handling (FIX 25/05/2026 incident Cavallino "Brig API error 429
   * maximum number of requests [100]"): la sandbox BRiG impone 100
   * req/giorno totali. Quando la quota e' esaurita, BRiG ritorna 429 con
   * body contenente "maximum number of requests" — NON e' transient.
   * Ritentare in 500ms/1500ms e' inutile (la quota non si libera fino a
   * mezzanotte) e brucia 2 chiamate aggiuntive per ogni run, accelerando
   * la corruzione e generando log/alert spurii. Distinguiamo:
   *   - 429 con body "maximum number of requests"  → quota giornaliera,
   *     errore subito, niente retry. Il chiamante (BrigError.body)
   *     riconosce il pattern e setta il circuit-breaker giornaliero.
   *   - 429 generico (rate-limit per secondo)       → retry come prima.
   */
  private async request(
    method: "GET" | "POST" | "PUT",
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }

    const hasBody = options.body !== undefined
    const init: RequestInit = {
      method,
      headers: this.headers(hasBody),
      // 30s di default sulla request: evita che lo spike si blocchi all'infinito
      signal: AbortSignal.timeout(30_000),
    }
    if (hasBody) init.body = JSON.stringify(options.body)

    const maxAttempts = 3
    let lastErr: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url.toString(), init)
        // 429 quota giornaliera: NO retry, restituisci subito.
        if (res.status === 429) {
          // Peek del body senza consumarlo: clone() per lasciarlo leggibile al chiamante.
          let bodyPeek = ""
          try {
            bodyPeek = await res.clone().text()
          } catch {
            /* ignore */
          }
          if (isBrigDailyQuotaExceeded(bodyPeek)) {
            return res
          }
          // 429 generico (transient): retry con backoff
          if (attempt < maxAttempts) {
            await sleep(backoffMs(attempt))
            continue
          }
          return res
        }
        // Retry solo su 5xx
        if (res.status >= 500) {
          if (attempt < maxAttempts) {
            await sleep(backoffMs(attempt))
            continue
          }
        }
        return res
      } catch (err) {
        // Errore di rete o timeout: ritenta
        lastErr = err
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt))
          continue
        }
        throw err
      }
    }
    throw lastErr ?? new Error("BrigClient: request failed after retries")
  }

  private async json<T>(res: Response): Promise<T> {
    const text = await res.text()
    if (!res.ok) throw new BrigError(res.status, text)
    if (!text) return {} as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new BrigError(res.status, text, `Brig API returned non-JSON body (status ${res.status})`)
    }
  }

  /**
   * POST /api/ext/reservations/daily-occupancy-filters
   *
   * Lista prenotazioni paginata. Il filtro principale è `structureId` (array).
   * Limiti: 100 req/giorno, max 100 prenotazioni per richiesta.
   */
  async getReservations(params: {
    page?: number
    pageSize?: number
    /** Filtri aggiuntivi (status, periodi, channelCode, ...). Vanno verificati con l'API spec. */
    extra?: Record<string, unknown>
  } = {}): Promise<BrigPaginatedReservations> {
    const body: Record<string, unknown> = {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
      structureId: [this.structureId],
      ...(params.extra ?? {}),
    }
    const res = await this.request("POST", "/api/ext/reservations/daily-occupancy-filters", { body })
    return this.json<BrigPaginatedReservations>(res)
  }

  /** GET /api/nol/roomtypes/list?sid=... */
  async getRoomTypes(): Promise<BrigRoomType[] | Record<string, unknown>> {
    const res = await this.request("GET", "/api/nol/roomtypes/list", {
      query: { sid: this.structureId },
    })
    return this.json(res)
  }

  /** GET /api/nol/rateplans/list?sid=... */
  async getRatePlans(): Promise<BrigRatePlan[] | Record<string, unknown>> {
    const res = await this.request("GET", "/api/nol/rateplans/list", {
      query: { sid: this.structureId },
    })
    return this.json(res)
  }

  /**
   * PUT /api/nol/rates/update/{sid}
   *
   * Push tariffe giornaliere verso BRiG. Aggiunto 20/05/2026 per Hotel Cavallino.
   *
   * Schema body: la documentazione ufficiale BRiG (readme.io) descrive
   * "Aggiornamento tariffe giornaliere" ma non e' scrapabile (SPA). Il
   * formato canonico per i PMS che fanno bridging (BRiG e' un bridge) e':
   *
   *   { rates: [
   *       { roomCode, ratePlanCode, date: "YYYY-MM-DD", amount: number, currency: "EUR" },
   *       ...
   *     ]
   *   }
   *
   * Se la prima chiamata reale ritorna 4xx con un messaggio di formato,
   * leggi BrigError.body (ritorna il payload completo restituito dal
   * gateway) e adatta `payload` qui sotto. NON modificare la firma del
   * metodo: i caller passano sempre items canonici e questa funzione li
   * traduce nel formato del gateway.
   *
   * Limiti: nessuno documentato. Per sicurezza il chiamante in
   * lib/connectors/brig/push-impl.ts batcha a 200 items per chiamata.
   */
  async updateRates(items: BrigRateUpdateItem[]): Promise<BrigRateUpdateResponse> {
    if (items.length === 0) {
      return { processed: 0, accepted: 0, rejected: 0, raw: null }
    }
    const payload = {
      rates: items.map((it) => ({
        roomCode: it.roomCode,
        ratePlanCode: it.ratePlanCode,
        date: it.date,
        amount: it.amount,
        currency: it.currency ?? "EUR",
      })),
    }
    const res = await this.request("PUT", `/api/nol/rates/update/${encodeURIComponent(this.structureId)}`, {
      body: payload,
    })
    const body = await this.json<Record<string, unknown>>(res)
    // Forma di risposta non documentata: tentiamo di estrarre i contatori
    // standard, fallback su processed=items.length se BRiG ritorna solo {ok:true}.
    const processed =
      typeof body.processed === "number"
        ? body.processed
        : typeof body.accepted === "number"
          ? body.accepted
          : items.length
    const accepted = typeof body.accepted === "number" ? body.accepted : processed
    const rejected = typeof body.rejected === "number" ? body.rejected : 0
    return { processed, accepted, rejected, raw: body }
  }
}

/** Helper: factory che legge config dalle env di test (usata solo dallo spike). */
export function createBrigTestClient(): BrigClient {
  const baseUrl = process.env.BRIG_BASE_URL
  const apiKey = process.env.BRIG_TEST_API_KEY
  const structureId = process.env.BRIG_TEST_STRUCTURE_ID
  if (!baseUrl || !apiKey || !structureId) {
    throw new Error(
      "BRIG_BASE_URL / BRIG_TEST_API_KEY / BRIG_TEST_STRUCTURE_ID non configurati nelle env del progetto",
    )
  }
  return new BrigClient({ baseUrl, apiKey, structureId })
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizza il base URL:
 *   - rimuove la trailing slash
 *   - aggiunge `https://` se manca lo schema (succede spesso impostando l'env var
 *     come `dominio.tld` senza protocollo).
 */
function normalizeBaseUrl(s: string): string {
  const trimmed = (s ?? "").trim()
  if (!trimmed) return ""
  const withSchema = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withSchema.endsWith("/") ? withSchema.slice(0, -1) : withSchema
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 1° retry: 500ms, 2° retry: 1500ms */
function backoffMs(attempt: number): number {
  return Math.min(500 * 3 ** (attempt - 1), 5000)
}

/**
 * Riconosce il body 429 di quota giornaliera BRiG.
 * Esempio reale: {"error":"You have reached the maximum number of requests [100]"}
 * Il numero tra parentesi varia (sandbox=100, prod=1000+) quindi matchiamo solo
 * la frase chiave "maximum number of requests" (case-insensitive).
 */
export function isBrigDailyQuotaExceeded(body: string | null | undefined): boolean {
  if (!body) return false
  return /maximum\s+number\s+of\s+requests/i.test(body)
}
