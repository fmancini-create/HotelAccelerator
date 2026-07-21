/**
 * Google Business Profile — risposta pubblica alle recensioni Google.
 *
 * Permette di PUBBLICARE direttamente da Santaddeo la risposta a una recensione
 * Google, usando le API ufficiali (lo scraping Apify è sola lettura).
 *
 * Flusso OAuth per-hotel: ogni struttura collega il proprio account Google
 * Business (scope `business.manage`), salviamo il refresh_token in
 * `hotel_integrations`. Da lì otteniamo un access_token a richiesta.
 *
 * API usate:
 * - Token:     POST https://oauth2.googleapis.com/token
 * - Userinfo:  GET  https://www.googleapis.com/oauth2/v2/userinfo (email)
 * - Accounts:  GET  https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 * - Locations: GET  https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
 * - Reviews:   GET  https://mybusiness.googleapis.com/v4/{account}/{location}/reviews
 * - Reply:     PUT  https://mybusiness.googleapis.com/v4/{name}/reply
 *
 * NB: l'API "Google My Business" v4 (reviews) ha quota che PARTE DA 0 e va
 * richiesta/approvata da Google Cloud Console. Finché non è approvata, le
 * chiamate reviews/reply ritornano 403 → mappato in `GoogleBusinessQuotaError`
 * così la UI mostra un messaggio chiaro (niente finti successi).
 */

import { createHmac } from "crypto"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const MYBUSINESS_V4_BASE = "https://mybusiness.googleapis.com/v4"

export const GOOGLE_BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage"

/** L'API reviews non è ancora abilitata/approvata per il progetto (quota 0). */
export class GoogleBusinessQuotaError extends Error {
  /** true se l'API non è proprio ABILITATA nel progetto (config risolvibile
   *  subito), false/undefined se è un 403 di quota/permessi. */
  readonly apiNotEnabled: boolean
  /** Nome dell'API da abilitare, se rilevabile dal messaggio di Google. */
  readonly serviceName: string | null
  constructor(
    message = "API Google Business non ancora approvata (quota non abilitata)",
    opts?: { apiNotEnabled?: boolean; serviceName?: string | null },
  ) {
    super(message)
    this.name = "GoogleBusinessQuotaError"
    this.apiNotEnabled = opts?.apiNotEnabled ?? false
    this.serviceName = opts?.serviceName ?? null
  }
}

/**
 * Interpreta un 403 di Google: distingue "API non abilitata nel progetto"
 * (PERMISSION_DENIED con reason SERVICE_DISABLED → l'utente la abilita subito in
 * Cloud Console) da un 403 di quota/permessi (richiede approvazione).
 */
function quotaErrorFrom403(json: unknown): GoogleBusinessQuotaError {
  const err = (json as { error?: { message?: string; details?: unknown[] } })?.error
  const message = err?.message ?? ""
  const details = (err?.details ?? []) as Array<{ reason?: string; metadata?: Record<string, string> }>
  const disabled = details.find((d) => d?.reason === "SERVICE_DISABLED")
  if (disabled || /has not been used in project|is disabled/i.test(message)) {
    const serviceName =
      disabled?.metadata?.service ??
      message.match(/([a-z]+\.googleapis\.com)/i)?.[1] ??
      null
    return new GoogleBusinessQuotaError(message, { apiNotEnabled: true, serviceName })
  }
  return new GoogleBusinessQuotaError(message || undefined)
}

/** Token mancante/revocato/scaduto: l'hotel deve ricollegare l'account. */
export class GoogleBusinessAuthError extends Error {
  constructor(message = "Token Google non valido: ricollega l'account Google Business") {
    super(message)
    this.name = "GoogleBusinessAuthError"
  }
}

function getStateSecret(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SANTADDEO_SUPABASE_SERVICE_ROLE_KEY ||
    "santaddeo-fallback-state-secret"
  )
}

/** Firma lo state OAuth (hotelId + timestamp) per evitare CSRF/tampering. */
export function signState(hotelId: string): string {
  const payload = `${hotelId}.${Date.now()}`
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("base64url")
  return Buffer.from(`${payload}.${sig}`).toString("base64url")
}

/** Verifica lo state e ritorna l'hotelId (null se invalido o più vecchio di 1h). */
export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8")
    const parts = decoded.split(".")
    if (parts.length !== 3) return null
    const [hotelId, ts, sig] = parts
    const expected = createHmac("sha256", getStateSecret())
      .update(`${hotelId}.${ts}`)
      .digest("base64url")
    if (sig !== expected) return null
    if (Date.now() - Number(ts) > 60 * 60 * 1000) return null
    return hotelId
  } catch {
    return null
  }
}

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_BUSINESS_CLIENT_ID
  const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_BUSINESS_CLIENT_ID / GOOGLE_BUSINESS_CLIENT_SECRET non configurati",
    )
  }
  return { clientId, clientSecret }
}

/**
 * Redirect URI registrato in Google Cloud Console. Derivato dall'origin pubblico
 * (env esplicita o request). Deve combaciare ESATTAMENTE con quello registrato.
 */
export function getRedirectUri(origin?: string): string {
  const base =
    process.env.GOOGLE_BUSINESS_REDIRECT_URI ||
    `${(origin || process.env.NEXT_PUBLIC_SITE_URL || "https://santaddeo.com").replace(/\/$/, "")}/api/integrations/google-business/callback`
  return base
}

/** Costruisce l'URL di consenso OAuth (access_type=offline per il refresh token). */
export function buildConsentUrl(state: string, origin?: string): string {
  const { clientId } = getClientCredentials()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: `${GOOGLE_BUSINESS_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Scambia l'authorization code per i token (include refresh_token). */
export async function exchangeCodeForTokens(
  code: string,
  origin?: string,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const { clientId, clientSecret } = getClientCredentials()
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Token exchange fallito: ${json.error_description || json.error || res.status}`)
  }
  return {
    accessToken: json.access_token as string,
    refreshToken: (json.refresh_token as string) ?? null,
  }
}

/** Ottiene un access_token fresco dal refresh_token salvato. */
export async function getAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = getClientCredentials()
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    // invalid_grant = refresh token revocato/scaduto
    if (json.error === "invalid_grant") throw new GoogleBusinessAuthError()
    throw new Error(`Refresh token fallito: ${json.error_description || json.error || res.status}`)
  }
  return json.access_token as string
}

/** Email dell'account Google collegato (per mostrarla nelle impostazioni). */
export async function getConnectedEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const json = await res.json().catch(() => ({}))
  return (json.email as string) ?? null
}

export interface GoogleBusinessAccount {
  name: string // "accounts/123"
  accountName?: string
}
export interface GoogleBusinessLocation {
  name: string // "locations/456" (relativo all'account)
  title?: string
  storefrontAddress?: { addressLines?: string[]; locality?: string }
}

/** Elenca gli account Business accessibili dall'utente collegato. */
export async function listAccounts(accessToken: string): Promise<GoogleBusinessAccount[]> {
  const res = await fetch(ACCOUNTS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) throw new GoogleBusinessAuthError()
  const json = await res.json().catch(() => ({}))
  // 429 = "Quota exceeded ... Requests per minute": sui progetti nuovi la quota
  // di default delle Business Profile API è 0 finché Google non approva la
  // richiesta di accesso. Lo trattiamo come quota non approvata.
  if (res.status === 403 || res.status === 429) throw quotaErrorFrom403(json)
  if (!res.ok) throw new Error(`listAccounts fallito: ${json.error?.message || res.status}`)
  return (json.accounts as GoogleBusinessAccount[]) ?? []
}

/** Elenca le location (sedi) di un account. */
export async function listLocations(
  accessToken: string,
  accountName: string,
): Promise<GoogleBusinessLocation[]> {
  const readMask = "name,title,storefrontAddress"
  const url = `${BUSINESS_INFO_BASE}/${accountName}/locations?readMask=${encodeURIComponent(readMask)}&pageSize=100`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (res.status === 401) throw new GoogleBusinessAuthError()
  const json = await res.json().catch(() => ({}))
  if (res.status === 403 || res.status === 429) throw quotaErrorFrom403(json)
  if (!res.ok) throw new Error(`listLocations fallito: ${json.error?.message || res.status}`)
  return (json.locations as GoogleBusinessLocation[]) ?? []
}

export interface GoogleReview {
  /** resource name completo: accounts/{a}/locations/{l}/reviews/{id} */
  name: string
  reviewId: string
  reviewer?: { displayName?: string }
  starRating?: string // "FIVE", "FOUR", ...
  comment?: string
  createTime?: string
  reviewReply?: { comment?: string; updateTime?: string }
}

/**
 * Elenca le recensioni di una location (API v4). Restituisce i `name` completi
 * necessari per pubblicare la risposta.
 */
export async function listReviews(
  accessToken: string,
  accountId: string,
  locationId: string,
): Promise<GoogleReview[]> {
  const acct = accountId.startsWith("accounts/") ? accountId : `accounts/${accountId}`
  const loc = locationId.startsWith("locations/") ? locationId : `locations/${locationId}`
  const out: GoogleReview[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${MYBUSINESS_V4_BASE}/${acct}/${loc}/reviews`)
    url.searchParams.set("pageSize", "50")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 401) throw new GoogleBusinessAuthError()
    if (res.status === 403 || res.status === 404) throw new GoogleBusinessQuotaError()
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`listReviews fallito: ${json.error?.message || res.status}`)
    for (const r of (json.reviews as GoogleReview[]) ?? []) out.push(r)
    pageToken = json.nextPageToken
  } while (pageToken)
  return out
}

/**
 * Pubblica/aggiorna la risposta a una recensione (PUT .../reply).
 * `reviewName` è il resource name completo della recensione.
 */
export async function updateReply(
  accessToken: string,
  reviewName: string,
  comment: string,
): Promise<{ updateTime?: string }> {
  const res = await fetch(`${MYBUSINESS_V4_BASE}/${reviewName}/reply`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment }),
  })
  if (res.status === 401) throw new GoogleBusinessAuthError()
  if (res.status === 403 || res.status === 404) throw new GoogleBusinessQuotaError()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`updateReply fallito: ${json.error?.message || res.status}`)
  return { updateTime: json.updateTime }
}
