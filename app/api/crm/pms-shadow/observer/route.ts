import { type NextRequest, NextResponse } from "next/server"
import type { Page } from "puppeteer-core"

import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { adminUserIdPerDatabase, getCallerIdentity } from "@/lib/auth/admin-access"
import { leggiBrowserbaseSessione, sessioneBrowserbaseAttiva } from "@/lib/pms/browserbase"
import { registraTracciaShadow } from "@/lib/pms/shadow/store"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const IDLE_FLUSH_MS = 8_000
const MAX_TRACES_PER_DRAIN = 20

type BrowserState = {
  active_session_id: string | null
  status: string
  browser_config_id: string | null
}

type BrowserConfig = { id: string; name: string }

type RawTrace = { steps?: unknown[] }

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
  return { identity, propertyId: identity.propertyId }
}

async function leggiSessione(propertyId: string): Promise<{ state: BrowserState; config: BrowserConfig } | null> {
  const sb = createServiceClient()
  const { data: state, error: stateError } = await sb
    .from("pms_browser_sessions")
    .select("active_session_id, status, browser_config_id")
    .eq("property_id", propertyId)
    .maybeSingle()

  if (stateError) throw new Error(`PMS_OBSERVER_STATE:${stateError.message}`)
  if (!state?.active_session_id || state.status !== "running" || !state.browser_config_id) return null

  const { data: config, error: configError } = await sb
    .from("pms_browser_configs")
    .select("id, name")
    .eq("id", state.browser_config_id)
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .maybeSingle()

  if (configError) throw new Error(`PMS_OBSERVER_CONFIG:${configError.message}`)
  if (!config) return null
  return { state: state as BrowserState, config: config as BrowserConfig }
}

/**
 * Codice eseguito DENTRO il PMS remoto.
 *
 * La regola fondamentale e' che non legge mai `value`, `innerHTML` o contenuti
 * dei campi. Registra soltanto la forma del gesto. Il buffer vive in
 * sessionStorage: sopravvive a una navigazione nello stesso PMS e viene poi
 * svuotato dal server. Se sessionStorage non e' disponibile, degrada a memoria
 * volatile invece di bloccare il lavoro dell'operatore.
 */
function installaOsservatore(idleFlushMs: number) {
  const w = window as Window & {
    __haPmsObserverInstalled?: boolean
    __haPmsDrain?: (force?: boolean) => Array<{ steps: unknown[] }>
  }
  if (w.__haPmsObserverInstalled) return
  w.__haPmsObserverInstalled = true

  const KEY = "__ha_pms_shadow_v1"
  const MAX_STEPS = 200
  const MAX_QUEUE = 20
  type Step = {
    action: "navigate" | "click" | "fill" | "select" | "submit" | "keypress"
    targetRole?: string | null
    targetLabel?: string | null
    urlPath?: string | null
    valueKind?: "empty" | "text" | "number" | "date" | "money" | "email" | "phone" | "secret" | null
  }
  type State = { current: Step[]; queue: Array<{ steps: Step[] }>; lastActionAt: number }

  function emptyState(): State {
    return { current: [], queue: [], lastActionAt: 0 }
  }

  function read(): State {
    try {
      const raw = sessionStorage.getItem(KEY)
      if (!raw) return emptyState()
      const parsed = JSON.parse(raw) as Partial<State>
      return {
        current: Array.isArray(parsed.current) ? parsed.current.slice(-MAX_STEPS) : [],
        queue: Array.isArray(parsed.queue) ? parsed.queue.slice(-MAX_QUEUE) : [],
        lastActionAt: typeof parsed.lastActionAt === "number" ? parsed.lastActionAt : 0,
      }
    } catch {
      return emptyState()
    }
  }

  let memory = read()

  function write() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(memory))
    } catch {
      // Il PMS puo' vietare lo storage; l'osservazione resta best-effort.
    }
  }

  function cleanText(value: string | null | undefined, max = 120): string | null {
    const text = value?.replace(/\s+/g, " ").trim()
    if (!text) return null
    if (/\S+@\S+\.\S+/.test(text)) return null
    if (/\+?\d[\d\s().-]{7,}\d/.test(text)) return null
    if (/\b\d{6,}\b/.test(text)) return null
    return text.slice(0, max)
  }

  function path(): string {
    return location.pathname || "/"
  }

  function roleOf(el: Element): string | null {
    return cleanText(el.getAttribute("role"), 40) || el.tagName.toLowerCase().slice(0, 40)
  }

  function labelOf(el: Element): string | null {
    const html = el as HTMLElement
    const input = el as HTMLInputElement
    const labelledBy = el.getAttribute("aria-labelledby")
    let labelled: string | null = null
    if (labelledBy) {
      const firstId = labelledBy.split(/\s+/)[0]
      const source = firstId ? document.getElementById(firstId) : null
      labelled = cleanText(source?.textContent)
    }

    return (
      cleanText(el.getAttribute("aria-label")) ||
      labelled ||
      cleanText(input.placeholder) ||
      cleanText(input.name) ||
      cleanText(html.title) ||
      // Testo visibile solo per controlli espliciti. Evita righe/celle dove il
      // testo e' spesso il nome dell'ospite.
      (["BUTTON", "SUMMARY"].includes(el.tagName) ? cleanText(html.textContent) : null)
    )
  }

  function valueKind(el: Element): Step["valueKind"] {
    if (el instanceof HTMLInputElement) {
      const t = (el.type || "text").toLowerCase()
      if (t === "password") return "secret"
      if (["number", "range"].includes(t)) return "number"
      if (["date", "datetime-local", "month", "week", "time"].includes(t)) return "date"
      if (t === "email") return "email"
      if (t === "tel") return "phone"
      const hint = `${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase()
      if (/(prezzo|tariff|import|totale|amount|price|rate)/.test(hint)) return "money"
      return "text"
    }
    if (el instanceof HTMLTextAreaElement) return "text"
    return null
  }

  function push(step: Step) {
    const previous = memory.current[memory.current.length - 1]
    const fingerprint = JSON.stringify(step)
    if (previous && JSON.stringify(previous) === fingerprint) return
    memory.current.push(step)
    if (memory.current.length > MAX_STEPS) memory.current = memory.current.slice(-MAX_STEPS)
    memory.lastActionAt = Date.now()
    write()
  }

  function flush() {
    if (!memory.current.length) return
    memory.queue.push({ steps: memory.current })
    if (memory.queue.length > MAX_QUEUE) memory.queue = memory.queue.slice(-MAX_QUEUE)
    memory.current = []
    memory.lastActionAt = 0
    write()
  }

  push({ action: "navigate", urlPath: path() })

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest("button,a,[role='button'],[role='link'],summary") : null
      if (!target) return
      push({ action: "click", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path() })
    },
    true,
  )

  document.addEventListener(
    "change",
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target instanceof HTMLSelectElement) {
        push({ action: "select", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path(), valueKind: "text" })
        return
      }
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        push({ action: "fill", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path(), valueKind: valueKind(target) })
      }
    },
    true,
  )

  document.addEventListener(
    "submit",
    (event) => {
      const target = event.target instanceof Element ? event.target : null
      push({ action: "submit", targetRole: target ? roleOf(target) : "form", targetLabel: target ? labelOf(target) : null, urlPath: path() })
      flush()
    },
    true,
  )

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter") return
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      push({ action: "keypress", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path() })
    },
    true,
  )

  w.__haPmsDrain = (force = false) => {
    if (force || (memory.current.length > 0 && Date.now() - memory.lastActionAt >= idleFlushMs)) flush()
    const drained = memory.queue.splice(0, memory.queue.length)
    write()
    return drained
  }
}

async function preparaPagina(page: Page) {
  // `evaluateOnNewDocument` resta registrato sul target. Aggiungerlo a ogni
  // polling farebbe crescere senza limite gli script eseguiti dopo ore di
  // lavoro. Il marker in sessionStorage sopravvive alle navigazioni dello
  // stesso PMS e ci permette di registrarlo una sola volta per origine/target.
  const deveRegistrare = await page.evaluate(() => {
    const marker = "__ha_pms_observer_future_v1"
    try {
      if (sessionStorage.getItem(marker) === "1") return false
      sessionStorage.setItem(marker, "1")
      return true
    } catch {
      const w = window as Window & { __haPmsObserverFutureRegistered?: boolean }
      if (w.__haPmsObserverFutureRegistered) return false
      w.__haPmsObserverFutureRegistered = true
      return true
    }
  })

  if (deveRegistrare) await page.evaluateOnNewDocument(installaOsservatore, IDLE_FLUSH_MS)
  await page.evaluate(installaOsservatore, IDLE_FLUSH_MS)
}

async function drena(page: Page, force: boolean): Promise<RawTrace[]> {
  return page.evaluate((forza) => {
    const w = window as Window & { __haPmsDrain?: (force?: boolean) => Array<{ steps: unknown[] }> }
    return w.__haPmsDrain?.(forza) ?? []
  }, force)
}

async function osserva(request: NextRequest, force: boolean) {
  const who = await identifica(request)
  if ("denied" in who) return who.denied

  const active = await leggiSessione(who.propertyId)
  if (!active) return risposta({ ok: true, active: false, traces: 0, learned: 0 })

  const remote = await leggiBrowserbaseSessione(active.state.active_session_id!)
  if (!remote || !sessioneBrowserbaseAttiva(remote.status) || !remote.connectUrl) {
    return risposta({ ok: true, active: false, traces: 0, learned: 0 })
  }

  const puppeteer = (await import("puppeteer-core")).default
  const browser = await puppeteer.connect({ browserWSEndpoint: remote.connectUrl, defaultViewport: null })

  try {
    const pages = await browser.pages()
    let traces = 0
    let learned = 0
    let discarded = 0

    for (const page of pages) {
      await preparaPagina(page)
      const drained = (await drena(page, force)).slice(0, MAX_TRACES_PER_DRAIN)
      traces += drained.length

      for (const trace of drained) {
        if (!Array.isArray(trace.steps) || trace.steps.length === 0) continue
        const result = await registraTracciaShadow({
          propertyId: who.propertyId,
          // ID stabile e agnostico dal provider: rinominare il PMS non azzera
          // l'apprendimento e non richiede che esista un connettore API.
          pmsType: `browser:${active.config.id}`,
          source: "remote_browser",
          rawSteps: trace.steps,
          operatorId: adminUserIdPerDatabase(who.identity.adminUserId),
          operatorLabel: who.identity.fullName ?? who.identity.email,
        })
        learned += result.passiSalvati
        discarded += result.passiScartati
      }
    }

    return risposta({ ok: true, active: true, traces, learned, discarded })
  } finally {
    await browser.disconnect().catch(() => undefined)
  }
}

export async function POST(request: NextRequest) {
  try {
    return await osserva(request, false)
  } catch (error) {
    console.error("[pms-shadow-observer] raccolta non riuscita", {
      detail: error instanceof Error ? error.message : "Errore sconosciuto",
    })
    return risposta({ error: "Apprendimento PMS temporaneamente non disponibile" }, 502)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    return await osserva(request, true)
  } catch (error) {
    console.error("[pms-shadow-observer] flush non riuscito", {
      detail: error instanceof Error ? error.message : "Errore sconosciuto",
    })
    return risposta({ error: "Chiusura apprendimento PMS non riuscita" }, 502)
  }
}
