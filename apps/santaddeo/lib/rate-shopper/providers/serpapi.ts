import type { RateShopperProvider, FetchRatesParams, NormalizedRate } from "@/lib/rate-shopper/provider"

const ENDPOINT = "https://serpapi.com/search.json"

/** Aggiunge N giorni a una data YYYY-MM-DD (UTC) e ritorna YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Enumera le date YYYY-MM-DD da `from` a `to` inclusi. */
function enumerateDates(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + "T00:00:00Z")
  const end = new Date(to + "T00:00:00Z")
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/**
 * Estrae il prezzo per notte piu' basso dalla risposta google_hotels (property).
 * SerpApi espone diverse forme: `prices[].rate_per_night.extracted_lowest`,
 * `rate_per_night.extracted_lowest`, `total_rate.extracted_lowest`.
 */
function extractLowestPrice(data: unknown): number | null {
  const obj = data as Record<string, any>
  const candidates: number[] = []

  const pushNum = (n: unknown) => {
    const v = typeof n === "number" ? n : typeof n === "string" ? Number(n.replace(/[^\d.]/g, "")) : NaN
    if (Number.isFinite(v) && v > 0) candidates.push(v)
  }

  if (Array.isArray(obj?.prices)) {
    for (const p of obj.prices) {
      pushNum(p?.rate_per_night?.extracted_lowest)
      pushNum(p?.rate_per_night?.extracted_before_taxes_fees)
    }
  }
  if (Array.isArray(obj?.featured_prices)) {
    for (const p of obj.featured_prices) {
      pushNum(p?.rate_per_night?.extracted_lowest)
    }
  }
  pushNum(obj?.rate_per_night?.extracted_lowest)
  pushNum(obj?.total_rate?.extracted_lowest)

  return candidates.length ? Math.min(...candidates) : null
}

export interface CompetitorRoom {
  name: string
  numGuests: number | null
  price: number | null
}

/**
 * Riconosce dal messaggio di errore SerpApi se la quota di ricerche e' esaurita
 * (mensile o oraria). In questi casi NON ha senso continuare il batch: ogni
 * chiamata successiva fallirebbe identica, sprecando tempo (rischio timeout a
 * 300s) e riempiendo i log di warning. Esempi reali:
 *   "Your account has run out of searches."
 *   "You've exceeded the hourly limit of ... searches"
 */
function isQuotaError(message: unknown): boolean {
  if (typeof message !== "string") return false
  const m = message.toLowerCase()
  return (
    m.includes("run out of searches") ||
    m.includes("exceeded") ||
    m.includes("ran out") ||
    m.includes("hourly limit") ||
    m.includes("monthly limit") ||
    m.includes("plan limit")
  )
}

/**
 * Estrae il listino per-tipologia dalla risposta google_hotels.
 * SerpApi espone le camere in `featured_prices[].rooms[]` (e talvolta
 * `prices[].rooms[]`) con `name`, `num_guests` e
 * `rate_per_night.extracted_lowest` (o `total_rate`). Lo stesso nome camera
 * puo' comparire su piu' fornitori: deduplichiamo per nome tenendo il prezzo
 * piu' basso (tariffa "a partire da" per quella tipologia). Questo dettaglio
 * arriva nella STESSA chiamata gia' fatta: nessun costo SerpApi extra.
 */
function extractRooms(data: unknown): CompetitorRoom[] {
  const obj = data as Record<string, any>
  const byName = new Map<string, CompetitorRoom>()

  const num = (n: unknown): number | null => {
    const v = typeof n === "number" ? n : typeof n === "string" ? Number(n.replace(/[^\d.]/g, "")) : NaN
    return Number.isFinite(v) && v > 0 ? v : null
  }

  const sources = [obj?.featured_prices, obj?.prices].filter(Array.isArray) as any[][]
  for (const src of sources) {
    for (const p of src) {
      const rooms = Array.isArray(p?.rooms) ? p.rooms : []
      for (const r of rooms) {
        const name = typeof r?.name === "string" ? r.name.trim() : ""
        if (!name) continue
        const price = num(r?.rate_per_night?.extracted_lowest) ?? num(r?.total_rate?.extracted_lowest)
        const numGuests = typeof r?.num_guests === "number" ? r.num_guests : null
        const prev = byName.get(name)
        if (!prev) {
          byName.set(name, { name, numGuests, price })
        } else if (price != null && (prev.price == null || price < prev.price)) {
          byName.set(name, { name, numGuests: prev.numGuests ?? numGuests, price })
        }
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
}

/**
 * Cooldown di processo: dopo aver rilevato la quota esaurita, salviamo un
 * timestamp di "riprova non prima di". Il cron itera su PIU' hotel nello stesso
 * processo: senza questo, ogni hotel ripagherebbe lo stesso muro di 429.
 * In-memory (per-istanza serverless): best-effort, sufficiente a tagliare lo
 * spreco entro una singola invocazione/processo caldo.
 */
let quotaCooldownUntil = 0
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000 // 30 minuti

/** true se la quota SerpApi e' stata segnata esaurita di recente (cooldown). */
export function isSerpApiInCooldown(): boolean {
  return Date.now() < quotaCooldownUntil
}

/**
 * Provider Rate Shopper basato su SerpApi - Google Hotels.
 * Ogni competitor e' identificato dal suo `property_token` (salvato in
 * competitors.external_ref). Una chiamata = 1 proprieta' x 1 soggiorno, quindi
 * il numero di richieste cresce con (competitor x date): un cap di sicurezza
 * (RATE_SHOPPER_MAX_CALLS) evita di bruciare crediti.
 *
 * Gestione quota (FIX 08/06/2026): al primo 429 / errore di quota il batch si
 * FERMA (circuit breaker), restituisce i risultati parziali gia' raccolti e
 * attiva un cooldown di processo per saltare gli hotel successivi a costo zero.
 *
 * Env:
 *   SERPAPI_KEY               (obbligatoria)
 *   RATE_SHOPPER_CURRENCY     (default EUR)
 *   RATE_SHOPPER_MAX_CALLS    (default 400 per invocazione di fetchRates)
 */
export class SerpApiProvider implements RateShopperProvider {
  readonly key = "serpapi"

  isConfigured(): boolean {
    return Boolean(process.env.SERPAPI_KEY)
  }

  async fetchRates(params: FetchRatesParams): Promise<NormalizedRate[]> {
    if (!this.isConfigured()) {
      console.warn("[rate-shopper:serpapi] SERPAPI_KEY mancante, skip")
      return []
    }
    // Circuit breaker: se in questo processo abbiamo gia' visto la quota
    // esaurita di recente, saltiamo senza bruciare tempo/log.
    if (Date.now() < quotaCooldownUntil) {
      console.warn(
        `[rate-shopper:serpapi] quota esaurita di recente, skip fino a ${new Date(quotaCooldownUntil).toISOString()}`,
      )
      return []
    }
    const apiKey = process.env.SERPAPI_KEY!
    const currency = process.env.RATE_SHOPPER_CURRENCY || "EUR"
    // Cap di sicurezza per invocazione. Default alto abbastanza da coprire il
    // comp set massimo (6 competitor) x orizzonte (60 gg) = 360 chiamate.
    const maxCalls = Number(process.env.RATE_SHOPPER_MAX_CALLS || 400)
    const los = params.los ?? 1
    const occupancy = params.occupancy ?? 2

    const dates = enumerateDates(params.from, params.to)
    const validCompetitors = params.competitors.filter((c) => c.externalRef)
    // Genera i task in ordine PER-DATA (round-robin sui competitor): per ogni
    // data, una richiesta per ciascun competitor. In questo modo, se si
    // raggiunge il cap, TUTTI i competitor ottengono una copertura parziale equa
    // invece di vedere i primi competitor pieni e gli ultimi a zero. (FIX)
    // `q`: l'engine google_hotels di SerpApi RICHIEDE il parametro `q` anche
    // interrogando una singola proprieta' via property_token (altrimenti
    // "Missing query `q` parameter" e 0 prezzi). Usiamo il nome del competitor.
    const tasks: Array<{ competitorId: string; token: string; date: string; q: string }> = []
    for (const date of dates) {
      for (const c of validCompetitors) {
        tasks.push({ competitorId: c.id, token: c.externalRef!, date, q: c.name })
      }
    }
    const limited = tasks.slice(0, maxCalls)
    if (limited.length < tasks.length) {
      console.warn(
        `[rate-shopper:serpapi] cap raggiunto: ${limited.length}/${tasks.length} richieste (RATE_SHOPPER_MAX_CALLS=${maxCalls})`,
      )
    }

    const results: NormalizedRate[] = []
    const concurrency = 4
    let idx = 0
    // Flag condiviso tra i worker: appena uno rileva quota esaurita, tutti si
    // fermano al prossimo giro (niente altre chiamate sprecate).
    let quotaExhausted = false

    const worker = async () => {
      while (idx < limited.length && !quotaExhausted) {
        const my = limited[idx++]
        const checkOut = addDays(my.date, los)
        const url =
          `${ENDPOINT}?engine=google_hotels` +
          `&q=${encodeURIComponent(my.q || "hotel")}` +
          `&property_token=${encodeURIComponent(my.token)}` +
          `&check_in_date=${my.date}&check_out_date=${checkOut}` +
          `&adults=${occupancy}&currency=${encodeURIComponent(currency)}` +
          `&gl=it&hl=it&api_key=${encodeURIComponent(apiKey)}`
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
          if (!res.ok) {
            // 429 = quota/rate limit esaurita -> circuit breaker.
            if (res.status === 429) {
              quotaExhausted = true
              console.warn(
                `[rate-shopper:serpapi] HTTP 429 (quota esaurita): stop batch dopo ${idx}/${limited.length} richieste`,
              )
              break
            }
            console.warn(`[rate-shopper:serpapi] HTTP ${res.status} per token ${my.token} ${my.date}`)
            continue
          }
          const data = await res.json()
          if (data?.error) {
            // Alcuni errori di quota arrivano con HTTP 200 + campo `error`.
            if (isQuotaError(data.error)) {
              quotaExhausted = true
              console.warn(
                `[rate-shopper:serpapi] quota esaurita (${data.error}): stop batch dopo ${idx}/${limited.length} richieste`,
              )
              break
            }
            console.warn(`[rate-shopper:serpapi] errore API: ${data.error}`)
            continue
          }
          const price = extractLowestPrice(data)
          const rooms = extractRooms(data)
          results.push({
            competitorRef: my.competitorId,
            stayDate: my.date,
            price,
            currency,
            availability: price != null,
            los,
            occupancy,
            channel: "google_hotels",
            raw: { name: data?.name ?? null, type: data?.type ?? null, rooms },
          })
        } catch (err) {
          console.error(`[rate-shopper:serpapi] fetch fallita ${my.token} ${my.date}:`, err)
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, limited.length) }, worker))
    // Se abbiamo esaurito la quota, attiva il cooldown di processo cosi' gli
    // hotel successivi (cron) e i refresh ravvicinati non ripagano il muro.
    if (quotaExhausted) {
      quotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS
    }
    return results
  }
}
