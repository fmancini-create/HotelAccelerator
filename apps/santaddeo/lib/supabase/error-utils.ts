/**
 * Utility per gestire in modo pulito gli errori Supabase, in particolare
 * gli OUTAGE del gateway (Cloudflare 5xx) che restituiscono una pagina HTML
 * al posto del JSON PostgREST.
 *
 * STORIA: durante gli outage Supabase (es. 30/05 e 31/05 2026) il gateway
 * Cloudflare risponde con `<!DOCTYPE html> ... 522 Connection timed out`.
 * Il client PostgREST mette questo blob HTML dentro `error.message`. I cron
 * che facevano `console.error("...", error)` finivano per loggare l'intera
 * pagina HTML (decine di righe illeggibili per ogni errore) e ritornavano
 * 500 (allarme "errore applicativo") invece di 503 (outage transitorio del
 * provider, non colpa nostra).
 *
 * REGOLE (vedi memoria santaddeo-supabase-outage-failfast):
 *  - mai `console.error` su un errore Supabase grezzo: usa `logSupabaseError`
 *  - outage gateway / 5xx -> rispondere 503 (transitorio), non 500
 */

/**
 * Riconosce un errore di indisponibilita' del servizio (outage del gateway
 * Supabase/Cloudflare) distinguendolo da un vero errore applicativo.
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (!error) return false

  const parts: string[] = []
  if (typeof error === "string") {
    parts.push(error)
  } else if (typeof error === "object") {
    const e = error as Record<string, unknown>
    if (typeof e.message === "string") parts.push(e.message)
    if (typeof e.code === "string") parts.push(e.code)
    if (typeof e.status === "number") parts.push(String(e.status))
    if (typeof e.name === "string") parts.push(e.name)
  }
  const haystack = parts.join(" ").toLowerCase()

  return (
    // PGRST002 (FIX 04/07/2026): "Could not query the database for the schema
    // cache. Retrying." -> PostgREST non e' riuscito a raggiungere il DB per
    // costruire la schema cache (riavvio/pool esaurito). E' TRANSITORIO (il
    // messaggio stesso dice "Retrying"), non un bug applicativo -> 503, non 500.
    // NB: NON confondere con PGRST205 "Could not FIND THE TABLE ... in the
    // schema cache" (permanente): quello NON matcha queste stringhe specifiche.
    haystack.includes("pgrst002") ||
    haystack.includes("could not query the database for the schema cache") ||
    // pagina di errore Cloudflare (HTML al posto del JSON)
    haystack.includes("<!doctype html") ||
    haystack.includes("<html") ||
    haystack.includes("cloudflare") ||
    // messaggi tipici di outage gateway
    haystack.includes("connection timed out") ||
    haystack.includes("web server is down") ||
    haystack.includes("bad gateway") ||
    haystack.includes("service unavailable") ||
    haystack.includes("gateway time-out") ||
    // codici 52x di Cloudflare + 502/503/504 classici
    haystack.includes("520") ||
    haystack.includes("521") ||
    haystack.includes("522") ||
    haystack.includes("523") ||
    haystack.includes("524") ||
    haystack.includes("502") ||
    haystack.includes("503") ||
    haystack.includes("504")
  )
}

/**
 * Estrae un messaggio compatto e leggibile da un errore Supabase, troncando
 * eventuali blob HTML del gateway a una sola riga riconoscibile.
 */
export function compactSupabaseErrorMessage(error: unknown): string {
  if (!error) return "unknown error"
  if (typeof error === "string") {
    return error.toLowerCase().includes("<!doctype html") ||
      error.toLowerCase().includes("<html")
      ? "gateway outage (HTML error page)"
      : error.slice(0, 300)
  }
  const e = error as Record<string, unknown>
  const rawMsg = typeof e.message === "string" ? e.message : String(error)
  const lower = rawMsg.toLowerCase()
  if (lower.includes("<!doctype html") || lower.includes("<html")) {
    // estrai il code Cloudflare se presente (es. "522")
    const m = rawMsg.match(/\b(50[234]|52[0-4])\b/)
    return `gateway outage (HTML error page${m ? `, code ${m[1]}` : ""})`
  }
  const code = typeof e.code === "string" ? ` [${e.code}]` : ""
  return `${rawMsg.slice(0, 300)}${code}`
}

/**
 * Logga un errore Supabase in modo compatto: una sola riga, MAI il blob HTML.
 * Usa console.warn per gli outage (transitori) e console.error per i veri
 * errori applicativi.
 */
export function logSupabaseError(context: string, error: unknown): void {
  const msg = compactSupabaseErrorMessage(error)
  // Tutti i casi TRANSITORI (outage gateway + timeout di withTimeout) vanno a
  // console.warn: sono attesi, gia' gestiti con 503, e non devono comparire come
  // level:error nella dashboard. Prima si usava isServiceUnavailableError, che
  // NON copriva OperationTimeoutError -> i timeout (es. "pms/last-sync ... timed
  // out after 15000ms") finivano in console.error = rumore. console.error resta
  // solo per i veri errori applicativi.
  if (isTransientError(error)) {
    console.warn(`[supabase-outage] ${context}: ${msg}`)
  } else {
    console.error(`[supabase] ${context}: ${msg}`)
  }
}

/**
 * Errore lanciato da `withTimeout` quando un'operazione supera il limite.
 * Trattato come outage transitorio (503), non come bug applicativo (500).
 */
export class OperationTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`operation "${label}" timed out after ${ms}ms`)
    this.name = "OperationTimeoutError"
  }
}

/**
 * Fail-fast: avvolge una promise con un timeout. Durante un outage del gateway
 * Supabase le query possono restare appese fino al limite runtime Vercel
 * (300s/60s). Meglio fallire dopo `ms` e rispondere 503: la prossima
 * invocazione schedulata (o il prossimo poll della UI) riprovera'.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OperationTimeoutError(label, ms)), ms)
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** True se l'errore e' un outage gateway O un timeout di `withTimeout`. */
export function isTransientError(error: unknown): boolean {
  return error instanceof OperationTimeoutError || isServiceUnavailableError(error)
}
