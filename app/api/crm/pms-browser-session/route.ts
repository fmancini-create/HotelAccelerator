import { createHash, randomUUID } from "node:crypto"
import { after, type NextRequest, NextResponse } from "next/server"
import type { Browser } from "puppeteer-core"

import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import {
  BrowserbaseApiError,
  creaBrowserbaseContext,
  creaBrowserbaseSessione,
  leggiBrowserbaseLiveView,
  leggiBrowserbaseSessione,
  sessioneBrowserbaseAttiva,
  terminaBrowserbaseSessione,
} from "@/lib/pms/browserbase"
import { createServiceClient } from "@/lib/supabase/server"

export const maxDuration = 800
export const dynamic = "force-dynamic"

const FREE_CONNECTION_HOLD_MS = 12 * 60 * 1000

type BrowserState = {
  property_id: string
  browser_config_id: string | null
  context_id: string | null
  active_session_id: string | null
  status: "idle" | "starting" | "running" | "ended" | "error"
  persistent: boolean
  session_expires_at: string | null
  lease_id: string | null
}

type BrowserConfig = {
  id: string
  web_url: string
  is_active: boolean
}

function risposta(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}

async function identifica(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return { denied: areaDeniedResponse(decision) as NextResponse }

  const identity = await getCallerIdentity(request)
  if (!identity) return { denied: risposta({ error: "Non autenticato" }, 401) }
  if (!identity.propertyId) return { denied: risposta({ error: "Nessuna struttura attiva selezionata" }, 400) }

  return { propertyId: identity.propertyId }
}

async function configurazioneBrowserAttiva(propertyId: string): Promise<BrowserConfig | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_browser_configs")
    .select("id, web_url, is_active")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw new Error(`PMS_CONFIG_READ:${error.message}`)
  return data as BrowserConfig | null
}

function webUrlDa(config: BrowserConfig): string | null {
  try {
    const url = new URL(config.web_url)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

async function leggiStato(propertyId: string): Promise<BrowserState | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_browser_sessions")
    .select(
      "property_id, browser_config_id, context_id, active_session_id, status, persistent, session_expires_at, lease_id",
    )
    .eq("property_id", propertyId)
    .maybeSingle()

  if (error) throw new Error(`PMS_BROWSER_STATE_READ:${error.message}`)
  return data as BrowserState | null
}

async function salvaErrore(propertyId: string, leaseId: string, message: string) {
  const sb = createServiceClient()
  await sb
    .from("pms_browser_sessions")
    .update({
      status: "error",
      active_session_id: null,
      lease_id: null,
      lease_expires_at: null,
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("property_id", propertyId)
    .eq("lease_id", leaseId)
}

async function segnaTerminata(propertyId: string, sessionId: string) {
  const sb = createServiceClient()
  await sb
    .from("pms_browser_sessions")
    .update({
      status: "ended",
      active_session_id: null,
      persistent: false,
      session_expires_at: null,
      lease_id: null,
      lease_expires_at: null,
      last_ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("property_id", propertyId)
    .eq("active_session_id", sessionId)
}

async function rispostaSessioneEsistente(state: BrowserState) {
  if (!state.active_session_id || state.status !== "running") return null

  const remote = await leggiBrowserbaseSessione(state.active_session_id)
  if (!remote || !sessioneBrowserbaseAttiva(remote.status)) {
    await segnaTerminata(state.property_id, state.active_session_id)
    return null
  }

  const liveViewUrl = await leggiBrowserbaseLiveView(remote.id)
  return risposta({
    source: "remote_browser",
    liveViewUrl,
    expiresAt: remote.expiresAt ?? state.session_expires_at,
    persistent: state.persistent,
  })
}

export async function POST(request: NextRequest) {
  const correlationId = randomUUID()
  const who = await identifica(request)
  if (who.denied) return who.denied
  const propertyId = who.propertyId!

  let browserConfig: BrowserConfig | null = null
  let leaseId: string | null = null
  let browser: Browser | null = null
  let sessionId: string | null = null

  try {
    browserConfig = await configurazioneBrowserAttiva(propertyId)
    if (!browserConfig) return risposta({ error: "Collegamento al gestionale da completare" }, 409)

    const webUrl = webUrlDa(browserConfig)
    if (!webUrl) return risposta({ error: "Indirizzo del gestionale da completare" }, 409)

    const state = await leggiStato(propertyId)
    if (state) {
      const existing = await rispostaSessioneEsistente(state)
      if (existing) return existing
    }

    leaseId = randomUUID()
    const sb = createServiceClient()
    const { data: leased, error: leaseError } = await sb.rpc("acquire_pms_browser_session_lease_v2", {
      p_property_id: propertyId,
      p_browser_config_id: browserConfig.id,
      p_lease_id: leaseId,
      p_lease_seconds: 90,
    })

    if (leaseError) throw new Error(`PMS_BROWSER_LEASE:${leaseError.message}`)
    const lease = (Array.isArray(leased) ? leased[0] : leased) as BrowserState | null
    if (!lease) return risposta({ error: "Apertura del gestionale già in corso", retryAfterMs: 1_500 }, 409)

    const contextId = lease.context_id ?? (await creaBrowserbaseContext())
    if (!lease.context_id) {
      const { error: contextSaveError } = await sb
        .from("pms_browser_sessions")
        .update({ context_id: contextId, updated_at: new Date().toISOString() })
        .eq("property_id", propertyId)
        .eq("lease_id", leaseId)
      if (contextSaveError) throw new Error(`PMS_BROWSER_CONTEXT_SAVE:${contextSaveError.message}`)
    }
    const tenantKey = createHash("sha256").update(propertyId).digest("hex").slice(0, 20)
    const created = await creaBrowserbaseSessione({ contextId, tenantKey })
    sessionId = created.session.id

    const puppeteer = (await import("puppeteer-core")).default
    browser = await puppeteer.connect({ browserWSEndpoint: created.session.connectUrl })
    const pages = await browser.pages()
    const page = pages[0] ?? (await browser.newPage())
    await page.goto(webUrl, { waitUntil: "domcontentloaded", timeout: 45_000 })

    const liveViewUrl = await leggiBrowserbaseLiveView(created.session.id)
    const now = new Date().toISOString()
    const { error: saveError } = await sb
      .from("pms_browser_sessions")
      .update({
        context_id: contextId,
        active_session_id: created.session.id,
        status: "running",
        persistent: created.persistent,
        session_expires_at: created.session.expiresAt,
        lease_id: null,
        lease_expires_at: null,
        last_started_at: now,
        last_error: null,
        updated_at: now,
      })
      .eq("property_id", propertyId)
      .eq("lease_id", leaseId)

    if (saveError) throw new Error(`PMS_BROWSER_STATE_SAVE:${saveError.message}`)

    if (created.persistent) {
      await browser.disconnect()
      browser = null
    } else {
      // Sul Free keepAlive non e' disponibile. `after` mantiene la connessione
      // CDP dopo che la risposta e' gia' arrivata al client, entro maxDuration.
      if (!browser) throw new Error("PMS_BROWSER_CONNECTION_MISSING")
      const heldBrowser: Browser = browser
      const heldSessionId = created.session.id
      browser = null
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, FREE_CONNECTION_HOLD_MS))
        try {
          await heldBrowser.disconnect()
        } catch {
          // La sessione puo' essere stata chiusa prima dal client.
        }
        await segnaTerminata(propertyId, heldSessionId)
      })
    }

    return risposta({
      source: "remote_browser",
      liveViewUrl,
      expiresAt: created.session.expiresAt,
      persistent: created.persistent,
    })
  } catch (error) {
    if (browser) {
      try {
        await browser.disconnect()
      } catch {
        // Il browser puo' essersi gia' chiuso durante l'errore.
      }
    }
    if (sessionId) {
      try {
        await terminaBrowserbaseSessione(sessionId)
      } catch {
        // L'errore originale resta quello utile.
      }
    }

    const detail = error instanceof Error ? error.message : "Errore sconosciuto"
    console.error("[pms-browser] apertura non riuscita", { correlationId, propertyId, detail })
    if (leaseId) await salvaErrore(propertyId, leaseId, detail)

    const status = error instanceof BrowserbaseApiError && error.status === 503 ? 503 : 502
    return risposta({ error: "Il gestionale non è disponibile in questo momento", correlationId }, status)
  }
}

export async function DELETE(request: NextRequest) {
  const who = await identifica(request)
  if (who.denied) return who.denied
  const propertyId = who.propertyId!

  try {
    const state = await leggiStato(propertyId)
    if (!state?.active_session_id) return risposta({ ok: true })

    await terminaBrowserbaseSessione(state.active_session_id)
    await segnaTerminata(propertyId, state.active_session_id)
    return risposta({ ok: true })
  } catch (error) {
    console.error("[pms-browser] chiusura non riuscita", {
      propertyId,
      detail: error instanceof Error ? error.message : "Errore sconosciuto",
    })
    return risposta({ error: "Chiusura non riuscita" }, 502)
  }
}
