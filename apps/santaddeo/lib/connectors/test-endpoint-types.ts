/**
 * Tipi e helper condivisi per la sezione "Test endpoint connettore"
 * (Superadmin > Connectors Health).
 *
 * Ogni connettore con client API (Scidoo, BRiG, Slope) espone un array di
 * `EndpointTest`: la lista COMPLETA degli endpoint che usiamo per quel PMS,
 * con metodo/path/scopo. Gli endpoint read-only hanno una funzione `run` che
 * esegue una chiamata reale con le credenziali per-hotel e ritorna un
 * `EndpointTestResult` normalizzato; gli endpoint di scrittura (push) sono
 * elencati SENZA `run` (metadata soli) per non modificare dati reali sul PMS.
 *
 * Regola architetturale: nessuno switch su pms_name. Il route/UI lavorano sul
 * catalogo (`test-catalog.ts`) che aggrega questi array per codice connettore,
 * esattamente come il registry aggrega i connector.
 */

import type { PMSIntegration } from "./connector"

/**
 * Riga `pms_integrations` passata alle funzioni di test. Estende la forma
 * minima usata dai connector con `vat_number` (serve solo a Scidoo per la
 * produzione fiscale) e `config` (structureId BRiG).
 */
export interface TestIntegration extends PMSIntegration {
  vat_number?: string | null
}

export interface EndpointTestResult {
  ok: boolean
  /** Status HTTP quando disponibile (es. 401/403/429 su errore). */
  status?: number
  latencyMs: number
  /** Riassunto leggibile in caso di successo (es. "12 tipologie camera"). */
  summary?: string
  /** Messaggio d'errore normalizzato in caso di fallimento. */
  error?: string
}

export interface EndpointTest {
  /** Chiave stabile usata dalla UI/route per identificare l'endpoint. */
  key: string
  method: "GET" | "POST" | "PUT" | "PATCH"
  path: string
  description: string
  /** true = eseguibile (GET/lettura); false = scrittura, mostrato ma non testabile. */
  readOnly: boolean
  /** Presente solo sugli endpoint read-only. */
  run?: (integration: TestIntegration) => Promise<EndpointTestResult>
}

/** Versione serializzabile (senza `run`) inviata al client. */
export interface EndpointTestMetadata {
  key: string
  method: string
  path: string
  description: string
  readOnly: boolean
}

/** Finestra temporale piccola (oggi .. +N giorni) in formato YYYY-MM-DD. */
export function windowDates(days = 7): { from: string; to: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const today = new Date()
  const to = new Date(today)
  to.setDate(to.getDate() + days)
  return { from: fmt(today), to: fmt(to) }
}

/**
 * Finestra temporale PASSATA (oggi-N .. oggi) in formato YYYY-MM-DD. Serve
 * agli endpoint su dati storici come la produzione fiscale: i documenti
 * fiscali sono GIA' emessi, quindi nel futuro non esistono per definizione
 * (interrogarli con windowDates() torna sempre vuoto).
 */
export function pastWindowDates(days = 7): { from: string; to: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - days)
  return { from: fmt(from), to: fmt(today) }
}

/**
 * Esegue `fn` cronometrando la chiamata e normalizzando gli errori in un
 * `EndpointTestResult`. `fn` ritorna un summary (e opzionalmente uno status).
 */
export async function runTimed(
  fn: () => Promise<{ summary?: string; status?: number }>,
): Promise<EndpointTestResult> {
  const start = performance.now()
  try {
    const { summary, status } = await fn()
    return {
      ok: true,
      status,
      latencyMs: Math.round(performance.now() - start),
      summary,
    }
  } catch (err) {
    return normalizeError(err, Math.round(performance.now() - start))
  }
}

/**
 * Normalizza un errore in `EndpointTestResult`. Riconosce SlopeError/BrigError
 * (hanno `.status` e `.body`) e distingue gli errori di autenticazione
 * (401/403) per un messaggio piu' chiaro. Tronca body/messaggi lunghi.
 */
export function normalizeError(err: unknown, latencyMs: number): EndpointTestResult {
  const anyErr = err as { status?: unknown; body?: unknown; message?: unknown }
  const status = typeof anyErr?.status === "number" ? anyErr.status : undefined
  const body = typeof anyErr?.body === "string" ? anyErr.body : undefined
  const message = err instanceof Error ? err.message : String(err)

  const isAuth =
    status === 401 ||
    status === 403 ||
    /\b401\b|\b403\b|unauthorized|forbidden|not authorized/i.test(message)

  let error = body ? `${message} — ${body.slice(0, 200)}` : message
  if (isAuth) error = `Credenziali rifiutate (${status ?? "auth"}): ${error}`

  return { ok: false, status, latencyMs, error: error.slice(0, 500) }
}
