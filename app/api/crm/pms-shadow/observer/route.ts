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

type BrowserState = { active_session_id: string | null; status: string; browser_config_id: string | null }
type BrowserConfig = { id: string; name: string }
type RawTrace = { id?: string; steps?: unknown[] }

function risposta(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } })
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
 * Osservatore eseguito dentro il browser remoto. Non legge mai i valori dei
 * campi. La coda usa peek + ack: una traccia viene rimossa soltanto dopo che il
 * server l'ha persistita. Se l'ACK si perde, source_trace_id rende il retry
 * idempotente e non incrementa due volte la stessa procedura.
 */
function installaOsservatore(idleFlushMs: number) {
  const w = window as Window & {
    __haPmsObserverInstalledV2?: boolean
    __haPmsPeek?: (force?: boolean) => Array<{ id: string; steps: unknown[] }>
    __haPmsAck?: (ids: string[]) => void
  }
  if (w.__haPmsObserverInstalledV2) return
  w.__haPmsObserverInstalledV2 = true

  const KEY = "__ha_pms_shadow_v2"
  const MAX_STEPS = 200
  const MAX_QUEUE = 20
  type Step = {
    action: "navigate" | "click" | "fill" | "select" | "submit" | "keypress"
    targetRole?: string | null
    targetLabel?: string | null
    urlPath?: string | null
    valueKind?: "empty" | "text" | "number" | "date" | "money" | "email" | "phone" | "secret" | null
  }
  type Trace = { id: string; steps: Step[] }
  type State = { current: Step[]; queue: Trace[]; lastActionAt: number }

  const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  const emptyState = (): State => ({ current: [], queue: [], lastActionAt: 0 })

  function read(): State {
    try {
      const raw = sessionStorage.getItem(KEY)
      if (!raw) return emptyState()
      const parsed = JSON.parse(raw) as Partial<State>
      const queue = Array.isArray(parsed.queue)
        ? parsed.queue
            .filter((t): t is Trace => Boolean(t && typeof t.id === "string" && Array.isArray(t.steps)))
            .slice(-MAX_QUEUE)
        : []
      return {
        current: Array.isArray(parsed.current) ? parsed.current.slice(-MAX_STEPS) : [],
        queue,
        lastActionAt: typeof parsed.lastActionAt === "number" ? parsed.lastActionAt : 0,
      }
    } catch {
      return emptyState()
    }
  }

  let memory = read()
  const write = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(memory))
    } catch {
      // Se il PMS vieta sessionStorage si mantiene la memoria volatile.
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

  const path = () => location.pathname || "/"
  const roleOf = (el: Element) => cleanText(el.getAttribute("role"), 40) || el.tagName.toLowerCase().slice(0, 40)

  function labelOf(el: Element): string | null {
    const html = el as HTMLElement
    const input = el as HTMLInputElement
    const labelledBy = el.getAttribute("aria-labelledby")
    let labelled: string | null = null
    if (labelledBy) {
      const firstId = labelledBy.split(/\s+/)[0]
      labelled = cleanText(firstId ? document.getElementById(firstId)?.textContent : null)
    }
    return (
      cleanText(el.getAttribute("aria-label")) ||
      labelled ||
      cleanText(input.placeholder) ||
      cleanText(input.name) ||
      cleanText(html.title) ||
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
    if (previous && JSON.stringify(previous) === JSON.stringify(step)) return
    memory.current.push(step)
    if (memory.current.length > MAX_STEPS) memory.current = memory.current.slice(-MAX_STEPS)
    memory.lastActionAt = Date.now()
    write()
  }

  function flush() {
    if (!memory.current.length) return
    memory.queue.push({ id: newId(), steps: memory.current })
    if (memory.queue.length > MAX_QUEUE) memory.queue = memory.queue.slice(-MAX_QUEUE)
    memory.current = []
    memory.lastActionAt = 0
    write()
  }

  push({ action: "navigate", urlPath: path() })

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button,a,[role='button'],[role='link'],summary") : null
    if (!target) return
    push({ action: "click", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path() })
  }, true)

  document.addEventListener("change", (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target instanceof HTMLSelectElement) {
      push({ action: "select", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path(), valueKind: "text" })
      return
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      push({ action: "fill", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path(), valueKind: valueKind(target) })
    }
  }, true)

  document.addEventListener("submit", (event) => {
    const target = event.target instanceof Element ? event.target : null
    push({ action: "submit", targetRole: target ? roleOf(target) : "form", targetLabel: target ? labelOf(target) : null, urlPath: path() })
    flush()
  }, true)

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    const target = event.target instanceof Element ? event.target : null
    if (!target) return
    push({ action: "keypress", targetRole: roleOf(target), targetLabel: labelOf(target), urlPath: path() })
  }, true)

  w.__haPmsPeek = (force = false) => {
    if (force || (memory.current.length > 0 && Date.now() - memory.lastActionAt >= idleFlushMs)) flush()
    return memory.queue.map((trace) => ({ id: trace.id, steps: trace.steps }))
  }
  w.__haPmsAck = (ids) => {
    const done = new Set(ids)
    memory.queue = memory.queue.filter((trace) => !done.has(trace.id))
    write()
  }
}

async function preparaPagina(page: Page) {
  const deveRegistrare = await page.evaluate(() => {
    const marker = "__ha_pms_observer_future_v2"
    try {
      if (sessionStorage.getItem(marker) === "1") return false
      sessionStorage.setItem(marker, "1")
      return true
    } catch {
      const w = window as Window & { __haPmsObserverFutureRegisteredV2?: boolean }
      if (w.__haPmsObserverFutureRegisteredV2) return false
      w.__haPmsObserverFutureRegisteredV2 = true
      return true
    }
  })
  if (deveRegistrare) await page.evaluateOnNewDocument(installaOsservatore, IDLE_FLUSH_MS)
  await page.evaluate(installaOsservatore, IDLE_FLUSH_MS)
}

async function leggiCoda(page: Page, force: boolean): Promise<RawTrace[]> {
  return page.evaluate((forza) => {
    const w = window as Window & { __haPmsPeek?: (force?: boolean) => Array<{ id: string; steps: unknown[] }> }
    return w.__haPmsPeek?.(forza) ?? []
  }, force)
}

async function conferma(page: Page, ids: string[]) {
  if (!ids.length) return
  await page.evaluate((done) => {
    const w = window as Window & { __haPmsAck?: (ids: string[]) => void }
    w.__haPmsAck?.(done)
  }, ids)
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
      const pending = (await leggiCoda(page, force)).slice(0, MAX_TRACES_PER_DRAIN)
      traces += pending.length
      const ackIds: string[] = []

      for (const trace of pending) {
        if (!trace.id || !Array.isArray(trace.steps) || trace.steps.length === 0) {
          if (trace.id) ackIds.push(trace.id)
          continue
        }
        const result = await registraTracciaShadow({
          propertyId: who.propertyId,
          pmsType: `browser:${active.config.id}`,
          source: "remote_browser",
          sourceTraceId: trace.id,
          rawSteps: trace.steps,
          operatorId: adminUserIdPerDatabase(who.identity.adminUserId),
          operatorLabel: who.identity.fullName ?? who.identity.email,
        })
        learned += result.passiSalvati
        discarded += result.passiScartati
        ackIds.push(trace.id)
      }

      await conferma(page, ackIds)
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
