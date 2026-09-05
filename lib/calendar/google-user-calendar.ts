import "server-only"

import { decryptSecretIfNeeded, encryptSecret } from "@/lib/crypto/secrets"

type TokenRow = {
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
}

type TokenBundle = {
  accessToken: string
  refreshToken: string | null
  expiry: string | null
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_API = "https://www.googleapis.com/calendar/v3"

function googleClientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("google_oauth_not_configured")
  return { clientId, clientSecret }
}

export function getCalendarOAuthRedirectUri() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${baseUrl}/api/admin/crm/calendar/oauth/google/callback`
}

export function buildGoogleCalendarOAuthUrl(state: string) {
  const { clientId } = googleClientConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCalendarOAuthRedirectUri(),
    response_type: "code",
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar",
    ].join(" "),
    state,
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGoogleCalendarCode(code: string) {
  const { clientId, clientSecret } = googleClientConfig()
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getCalendarOAuthRedirectUri(),
    grant_type: "authorization_code",
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || "google_token_exchange_failed")
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiry: json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null,
    idToken: json.id_token ? String(json.id_token) : null,
  }
}

export async function googleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok || !json.email) throw new Error("google_userinfo_failed")
  return String(json.email).toLowerCase()
}

export async function ensureGoogleAccessToken(
  row: TokenRow,
  onRefresh?: (tokens: { oauth_access_token: string; oauth_refresh_token?: string; oauth_expiry: string | null }) => Promise<void>,
): Promise<TokenBundle> {
  const accessToken = decryptSecretIfNeeded(row.oauth_access_token)
  const refreshToken = decryptSecretIfNeeded(row.oauth_refresh_token)
  const expiryMs = row.oauth_expiry ? new Date(row.oauth_expiry).getTime() : 0
  if (accessToken && (!expiryMs || expiryMs > Date.now() + 60_000)) {
    return { accessToken, refreshToken, expiry: row.oauth_expiry }
  }
  if (!refreshToken) throw new Error("calendar_reconnect_required")

  const { clientId, clientSecret } = googleClientConfig()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || "calendar_reconnect_required")
  const nextExpiry = json.expires_in ? new Date(Date.now() + Number(json.expires_in) * 1000).toISOString() : null
  if (onRefresh) {
    await onRefresh({
      oauth_access_token: encryptSecret(String(json.access_token))!,
      ...(json.refresh_token ? { oauth_refresh_token: encryptSecret(String(json.refresh_token))! } : {}),
      oauth_expiry: nextExpiry,
    })
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: json.refresh_token ? String(json.refresh_token) : refreshToken,
    expiry: nextExpiry,
  }
}

async function googleJson<T>(accessToken: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
  if (res.status === 204) return undefined as T
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || `google_calendar_${res.status}`)
  return json as T
}

export type RemoteCalendar = {
  id: string
  summary: string
  primary: boolean
  accessRole: string
  backgroundColor: string | null
}

export async function listGoogleCalendars(accessToken: string): Promise<RemoteCalendar[]> {
  const json = await googleJson<any>(accessToken, `${GOOGLE_API}/users/me/calendarList?minAccessRole=reader&showHidden=false`)
  return (json.items || []).map((c: any) => ({
    id: String(c.id),
    summary: String(c.summary || c.id),
    primary: Boolean(c.primary),
    accessRole: String(c.accessRole || "reader"),
    backgroundColor: c.backgroundColor ? String(c.backgroundColor) : null,
  }))
}

export type CalendarEventInput = {
  summary: string
  description?: string | null
  location?: string | null
  startIso: string
  endIso: string
  timeZone?: string
}

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  start: string | null
  end: string | null
  allDay: boolean
  htmlLink: string | null
}

export async function listGoogleCalendarEvents(accessToken: string, calendarId: string, fromIso: string, toIso: string) {
  const params = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  })
  const json = await googleJson<any>(accessToken, `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
  return (json.items || []).map((ev: any): CalendarEvent => ({
    id: String(ev.id || ""),
    title: ev.visibility === "private" ? "Occupato" : String(ev.summary || "Occupato"),
    description: ev.visibility === "private" ? null : ev.description ? String(ev.description) : null,
    location: ev.visibility === "private" ? null : ev.location ? String(ev.location) : null,
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
    allDay: Boolean(ev.start?.date && !ev.start?.dateTime),
    htmlLink: ev.visibility === "private" ? null : ev.htmlLink || null,
  }))
}

export async function createGoogleCalendarEvent(accessToken: string, calendarId: string, input: CalendarEventInput) {
  const timeZone = input.timeZone || "Europe/Rome"
  return googleJson<any>(accessToken, `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description || undefined,
      location: input.location || undefined,
      start: { dateTime: input.startIso, timeZone },
      end: { dateTime: input.endIso, timeZone },
    }),
  })
}

export async function updateGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string, input: Partial<CalendarEventInput>) {
  const timeZone = input.timeZone || "Europe/Rome"
  const body: Record<string, unknown> = {}
  if (input.summary !== undefined) body.summary = input.summary
  if (input.description !== undefined) body.description = input.description || ""
  if (input.location !== undefined) body.location = input.location || ""
  if (input.startIso !== undefined) body.start = { dateTime: input.startIso, timeZone }
  if (input.endIso !== undefined) body.end = { dateTime: input.endIso, timeZone }
  return googleJson<any>(accessToken, `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export async function deleteGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string) {
  await googleJson<void>(accessToken, `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: "DELETE",
  })
}
