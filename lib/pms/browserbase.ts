/**
 * Adapter HTTP minimo per Browserbase.
 *
 * Le chiavi restano qui, in un modulo importato soltanto dalle route server.
 * Non restituiamo mai connectUrl o API key al client: il browser del tenant
 * riceve esclusivamente la Live View firmata e temporanea.
 */

import "server-only"

const API_BASE = "https://api.browserbase.com/v1"

export type BrowserbaseSessionStatus = "PENDING" | "RUNNING" | "ERROR" | "TIMED_OUT" | "COMPLETED"

export type BrowserbaseSession = {
  id: string
  status: BrowserbaseSessionStatus
  connectUrl: string
  expiresAt: string | null
  keepAlive: boolean
  contextId?: string | null
}

type BrowserbaseDebugLinks = {
  debuggerFullscreenUrl: string
  debuggerUrl: string
}

export class BrowserbaseApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "BrowserbaseApiError"
    this.status = status
  }
}

/**
 * Gli errori di capacità/quota sono transitori dal punto di vista del tenant:
 * non indicano una configurazione PMS errata e non vanno presentati come 502
 * generici. Il match resta confinato nell'adapter del provider, così la route
 * non dipende dal testo Browserbase e può esporre un codice applicativo stabile.
 */
export function isBrowserbaseCapacityError(error: unknown): boolean {
  if (!(error instanceof BrowserbaseApiError)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("browser minutes") ||
    message.includes("minutes limit") ||
    message.includes("minutes have been exhausted") ||
    message.includes("quota") ||
    message.includes("capacity")
  )
}

function configurazione() {
  const apiKey = process.env.BROWSERBASE_API_KEY?.trim()
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim()

  if (!apiKey || !projectId) {
    throw new BrowserbaseApiError("Browser remoto non configurato", 503)
  }

  return { apiKey, projectId }
}

function messaggioErrore(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    for (const key of ["message", "error", "detail"]) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300)
    }
  }
  return `Browser remoto non disponibile (HTTP ${status})`
}

async function richiesta<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiKey } = configurazione()
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": apiKey,
      ...init?.headers,
    },
  })

  const body = (await response.json().catch(() => null)) as unknown
  if (!response.ok) throw new BrowserbaseApiError(messaggioErrore(body, response.status), response.status)
  return body as T
}

export async function creaBrowserbaseContext(): Promise<string> {
  const { projectId } = configurazione()
  const context = await richiesta<{ id: string }>("/contexts", {
    method: "POST",
    body: JSON.stringify({ projectId }),
  })
  if (!context.id) throw new BrowserbaseApiError("Context del browser non creato", 502)
  return context.id
}

async function creaSessioneConProfilo(input: {
  contextId: string
  tenantKey: string
  keepAlive: boolean
  timeout: number
}): Promise<BrowserbaseSession> {
  const { projectId } = configurazione()
  return richiesta<BrowserbaseSession>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      region: "eu-central-1",
      keepAlive: input.keepAlive,
      timeout: input.timeout,
      browserSettings: {
        viewport: { width: 1920, height: 1080 },
        context: { id: input.contextId, persist: true },
        // Il PMS contiene dati personali degli ospiti: la Live View serve in
        // tempo reale, ma non conserviamo registrazione e log della sessione.
        recordSession: false,
        logSession: false,
      },
      userMetadata: {
        integration: "hotelaccelerator-pms",
        tenantKey: input.tenantKey,
      },
    }),
  })
}

/**
 * Prova prima il profilo persistente (piani a pagamento). Sul Free Browserbase
 * rifiuta keepAlive e/o la durata lunga: solo in quel caso ripiega su una
 * sessione di 15 minuti, che la route terra' collegata con `after()`.
 */
export async function creaBrowserbaseSessione(input: { contextId: string; tenantKey: string }): Promise<{
  session: BrowserbaseSession
  persistent: boolean
}> {
  try {
    const session = await creaSessioneConProfilo({
      ...input,
      keepAlive: true,
      timeout: 21_600,
    })
    // Alcuni piani possono accettare la richiesta ma disattivare keepAlive:
    // comanda la risposta effettiva, non cio' che abbiamo chiesto.
    return { session, persistent: session.keepAlive === true }
  } catch (error) {
    if (!(error instanceof BrowserbaseApiError) || ![400, 402, 403].includes(error.status)) throw error
  }

  const session = await creaSessioneConProfilo({
    ...input,
    keepAlive: false,
    timeout: 900,
  })
  return { session, persistent: false }
}

export async function leggiBrowserbaseSessione(sessionId: string): Promise<BrowserbaseSession | null> {
  try {
    return await richiesta<BrowserbaseSession>(`/sessions/${encodeURIComponent(sessionId)}`)
  } catch (error) {
    if (error instanceof BrowserbaseApiError && error.status === 404) return null
    throw error
  }
}

export async function leggiBrowserbaseLiveView(sessionId: string): Promise<string> {
  const links = await richiesta<BrowserbaseDebugLinks>(`/sessions/${encodeURIComponent(sessionId)}/debug`)
  if (!links.debuggerFullscreenUrl) throw new BrowserbaseApiError("Live View non disponibile", 502)

  const url = new URL(links.debuggerFullscreenUrl)
  url.searchParams.set("navbar", "false")
  return url.toString()
}

export async function terminaBrowserbaseSessione(sessionId: string): Promise<void> {
  try {
    await richiesta(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      body: JSON.stringify({ status: "REQUEST_RELEASE" }),
    })
  } catch (error) {
    // Chiudere una sessione gia' terminata e' idempotente.
    if (error instanceof BrowserbaseApiError && [404, 409, 410].includes(error.status)) return
    throw error
  }
}

export function sessioneBrowserbaseAttiva(status: BrowserbaseSessionStatus | string | null | undefined): boolean {
  return status === "PENDING" || status === "RUNNING"
}
