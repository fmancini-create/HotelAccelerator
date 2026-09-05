import "server-only"
import { createHmac } from "node:crypto"
import type { TelephonyProviderId } from "@/lib/telephony/providers"
import { ensureTelephonyHostIsPublic } from "@/lib/telephony/provider-url"
import { makeCall as makeThreeCxCall, testConnection as testThreeCxConnection } from "@/lib/telephony/threecx-client"

export type ProviderRuntimeConfig = {
  baseUrl: string
  clientId: string
  clientSecret: string
  defaultExtension: string
  providerConfig: Record<string, unknown>
}

export type ProviderCheck =
  | { ok: true; detail?: string }
  | { ok: false; status: number; error: string }

export type ProviderCallResult =
  | { ok: true; callId: string | null }
  | { ok: false; status: number; error: string; unsupported?: boolean }

function cleanBase(value: string): string {
  return value.replace(/\/+$/, "")
}

async function safeText(response: Response): Promise<string> {
  try { return (await response.text()).slice(0, 500) } catch { return "" }
}

/**
 * Tutti gli adapter passano da qui: il DNS viene ricontrollato anche a runtime
 * (non solo quando l'admin salva l'URL) e i redirect vengono rifiutati, cosi un
 * PBX non puo dirottare il backend verso localhost/reti private.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const safety = await ensureTelephonyHostIsPublic(url)
  if (!safety.ok) throw new Error(safety.error)
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  })
}

async function verifyWildix(cfg: ProviderRuntimeConfig): Promise<ProviderCheck> {
  try {
    const response = await fetchWithTimeout(`${cleanBase(cfg.baseUrl)}/api/v1/pbx/version/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.clientSecret}`, Accept: "application/json" },
    })
    if (response.ok) return { ok: true, detail: "PBX API Wildix raggiungibile." }
    if (response.status === 401) return { ok: false, status: 401, error: "Company API Key Wildix non valida o scaduta." }
    if (response.status === 403) return { ok: false, status: 403, error: "Chiave Wildix valida ma senza lo scope info:read (o pbx:read)." }
    return { ok: false, status: response.status, error: `Wildix ha risposto HTTP ${response.status}.` }
  } catch (error) {
    return { ok: false, status: 0, error: `Wildix non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

async function verifyNethVoice(cfg: ProviderRuntimeConfig): Promise<ProviderCheck> {
  try {
    const response = await fetchWithTimeout(`${cleanBase(cfg.baseUrl)}/webrest/authentication/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: cfg.clientId, password: cfg.clientSecret }),
    })
    const auth = response.headers.get("www-authenticate") || ""
    // La documentazione NethCTI specifica che il 401 CON nonce Digest significa
    // autenticazione riuscita; senza nonce le credenziali sono state rifiutate.
    if (response.status === 401 && /^Digest\s+\S+/i.test(auth)) {
      const nonce = auth.replace(/^Digest\s+/i, "").trim()
      const token = createHmac("sha1", cfg.clientSecret)
        .update(`${cfg.clientId}:${cfg.clientSecret}:${nonce}`)
        .digest("hex")
      if (!token) return { ok: false, status: 500, error: "Impossibile costruire il token NethCTI." }
      return { ok: true, detail: "Autenticazione NethCTI verificata." }
    }
    return { ok: false, status: response.status || 401, error: "NethVoice non ha accettato utente/password NethCTI." }
  } catch (error) {
    return { ok: false, status: 0, error: `NethVoice non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

function xmlOutcome(text: string): string | null {
  return text.match(/<outcome>\s*([^<\s]+)\s*<\/outcome>/i)?.[1] ?? null
}

async function verifyVoispeed(cfg: ProviderRuntimeConfig): Promise<ProviderCheck> {
  if (!cfg.defaultExtension) return { ok: false, status: 400, error: "Per VOIspeed serve un interno per eseguire il test." }
  try {
    const url = new URL(cfg.baseUrl)
    url.searchParams.set("service", "get_user_call_report")
    url.searchParams.set("token", cfg.clientSecret)
    url.searchParams.set("ext", cfg.defaultExtension)
    url.searchParams.set("limit", "1")
    const response = await fetchWithTimeout(url.toString(), { method: "GET", headers: { Accept: "application/xml,text/xml,*/*" } })
    const text = await safeText(response)
    if (response.ok && xmlOutcome(text) === "0") return { ok: true, detail: "SERI VOIspeed e token verificati." }
    return { ok: false, status: response.status || 400, error: `VOIspeed non ha accettato il test SERI${text ? `: ${text.slice(0, 180)}` : "."}` }
  } catch (error) {
    return { ok: false, status: 0, error: `VOIspeed non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

type YeastarTokenResponse = { errcode?: number; errmsg?: string; access_token?: string }

async function getYeastarToken(cfg: ProviderRuntimeConfig): Promise<{ ok: true; token: string } | { ok: false; status: number; error: string }> {
  try {
    const response = await fetchWithTimeout(`${cleanBase(cfg.baseUrl)}/openapi/v1.0/get_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "HotelAccelerator/1.0" },
      body: JSON.stringify({ username: cfg.clientId, password: cfg.clientSecret }),
    })
    const body = (await response.json().catch(() => null)) as YeastarTokenResponse | null
    if (response.ok && body?.errcode === 0 && body.access_token) return { ok: true, token: body.access_token }
    return { ok: false, status: response.status || 401, error: `Yeastar non ha rilasciato il token (${body?.errmsg || `HTTP ${response.status}`}).` }
  } catch (error) {
    return { ok: false, status: 0, error: `Yeastar non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

async function verifyYeastar(cfg: ProviderRuntimeConfig): Promise<ProviderCheck> {
  const auth = await getYeastarToken(cfg)
  if (!auth.ok) return auth
  try {
    const url = `${cleanBase(cfg.baseUrl)}/openapi/v1.0/system/information?access_token=${encodeURIComponent(auth.token)}`
    const response = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": "HotelAccelerator/1.0" } })
    const body = (await response.json().catch(() => null)) as { errcode?: number; errmsg?: string } | null
    if (response.ok && (body?.errcode === undefined || body.errcode === 0)) return { ok: true, detail: "OpenAPI Yeastar verificata." }
    return { ok: false, status: response.status, error: `Token valido, ma system/information non e accessibile (${body?.errmsg || `HTTP ${response.status}`}).` }
  } catch (error) {
    return { ok: false, status: 0, error: `Yeastar non raggiungibile dopo il login: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`
}

async function verifyAsterisk(cfg: ProviderRuntimeConfig): Promise<ProviderCheck> {
  try {
    const response = await fetchWithTimeout(`${cleanBase(cfg.baseUrl)}/ari/asterisk/info`, {
      method: "GET",
      headers: { Authorization: basicAuth(cfg.clientId, cfg.clientSecret), Accept: "application/json" },
    })
    if (response.ok) return { ok: true, detail: "Asterisk ARI verificata." }
    if (response.status === 401) return { ok: false, status: 401, error: "Utente o password ARI non validi." }
    return { ok: false, status: response.status, error: `Asterisk ARI ha risposto HTTP ${response.status}.` }
  } catch (error) {
    return { ok: false, status: 0, error: `Asterisk ARI non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

export async function verifyTelephonyConnection(provider: TelephonyProviderId, cfg: ProviderRuntimeConfig): Promise<ProviderCheck> {
  if (provider === "3cx") {
    // 3CX usa il client esistente, ma l'host e comunque controllato qui prima
    // della chiamata per applicare lo stesso confine SSRF degli altri adapter.
    const safety = await ensureTelephonyHostIsPublic(cfg.baseUrl)
    if (!safety.ok) return { ok: false, status: 400, error: safety.error }
    const result = await testThreeCxConnection({ baseUrl: cfg.baseUrl, clientId: cfg.clientId, clientSecret: cfg.clientSecret })
    return result.ok ? { ok: true, detail: `3CX verificato (${result.extensions.length} interni visibili).` } : { ok: false, status: result.status, error: result.error }
  }
  if (provider === "wildix") return verifyWildix(cfg)
  if (provider === "nethvoice") return verifyNethVoice(cfg)
  if (provider === "voispeed") return verifyVoispeed(cfg)
  if (provider === "yeastar") return verifyYeastar(cfg)
  if (provider === "asterisk_freepbx") return verifyAsterisk(cfg)
  return { ok: false, status: 409, error: "Questo provider richiede ancora la configurazione guidata e un collaudo del connettore OAuth/bridge." }
}

async function callVoispeed(cfg: ProviderRuntimeConfig, extension: string, destination: string): Promise<ProviderCallResult> {
  try {
    const url = new URL(cfg.baseUrl)
    url.searchParams.set("service", "call_request")
    url.searchParams.set("token", cfg.clientSecret)
    url.searchParams.set("ext", extension)
    url.searchParams.set("number", destination)
    url.searchParams.set("device", "sip")
    const response = await fetchWithTimeout(url.toString(), { method: "GET", headers: { Accept: "application/xml,text/xml,*/*" } })
    const text = await safeText(response)
    const outcome = xmlOutcome(text)
    const requestId = text.match(/<request_id>\s*([^<]+)\s*<\/request_id>/i)?.[1]?.trim() ?? null
    if (response.ok && outcome === "0") return { ok: true, callId: requestId }
    return { ok: false, status: response.status || 502, error: `VOIspeed ha rifiutato la chiamata${text ? `: ${text.slice(0, 180)}` : "."}` }
  } catch (error) {
    return { ok: false, status: 0, error: `VOIspeed non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

async function callYeastar(cfg: ProviderRuntimeConfig, extension: string, destination: string): Promise<ProviderCallResult> {
  const auth = await getYeastarToken(cfg)
  if (!auth.ok) return auth
  try {
    const url = `${cleanBase(cfg.baseUrl)}/openapi/v1.0/call/dial?access_token=${encodeURIComponent(auth.token)}`
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "HotelAccelerator/1.0" },
      body: JSON.stringify({ caller: extension, callee: destination, auto_answer: "no" }),
    })
    const body = (await response.json().catch(() => null)) as { errcode?: number; errmsg?: string; call_id?: string } | null
    if (response.ok && body?.errcode === 0) return { ok: true, callId: body.call_id ?? null }
    return { ok: false, status: response.status || 502, error: `Yeastar ha rifiutato la chiamata (${body?.errmsg || `HTTP ${response.status}`}).` }
  } catch (error) {
    return { ok: false, status: 0, error: `Yeastar non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

async function callAsterisk(cfg: ProviderRuntimeConfig, extension: string, destination: string): Promise<ProviderCallResult> {
  const template = typeof cfg.providerConfig.endpoint_template === "string" && cfg.providerConfig.endpoint_template.trim()
    ? cfg.providerConfig.endpoint_template.trim()
    : "PJSIP/{extension}"
  const context = typeof cfg.providerConfig.context === "string" && cfg.providerConfig.context.trim()
    ? cfg.providerConfig.context.trim()
    : "from-internal"
  const endpoint = template.replaceAll("{extension}", extension)
  try {
    const url = new URL(`${cleanBase(cfg.baseUrl)}/ari/channels`)
    url.searchParams.set("endpoint", endpoint)
    url.searchParams.set("extension", destination)
    url.searchParams.set("context", context)
    url.searchParams.set("priority", "1")
    url.searchParams.set("timeout", "30")
    const response = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { Authorization: basicAuth(cfg.clientId, cfg.clientSecret), Accept: "application/json" },
    })
    const body = (await response.json().catch(() => null)) as { id?: unknown; message?: unknown } | null
    if (response.ok) return { ok: true, callId: body?.id == null ? null : String(body.id) }
    return { ok: false, status: response.status, error: `Asterisk ha rifiutato l'originate (HTTP ${response.status})${body?.message ? `: ${String(body.message)}` : "."}` }
  } catch (error) {
    return { ok: false, status: 0, error: `Asterisk non raggiungibile: ${error instanceof Error ? error.message : "errore di rete"}.` }
  }
}

export async function makeTelephonyCall(provider: TelephonyProviderId, cfg: ProviderRuntimeConfig, extension: string, destination: string): Promise<ProviderCallResult> {
  if (provider === "3cx") {
    const safety = await ensureTelephonyHostIsPublic(cfg.baseUrl)
    if (!safety.ok) return { ok: false, status: 400, error: safety.error }
    return makeThreeCxCall({ baseUrl: cfg.baseUrl, clientId: cfg.clientId, clientSecret: cfg.clientSecret }, extension, destination)
  }
  if (provider === "voispeed") return callVoispeed(cfg, extension, destination)
  if (provider === "yeastar") return callYeastar(cfg, extension, destination)
  if (provider === "asterisk_freepbx") return callAsterisk(cfg, extension, destination)
  return {
    ok: false,
    status: 409,
    unsupported: true,
    error: "Click-to-call non ancora abilitato per questo centralino: HotelAccelerator non simula una funzione non collaudata.",
  }
}
