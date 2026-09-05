import "server-only"

import crypto from "node:crypto"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_API = "https://www.googleapis.com/calendar/v3"
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"

type CachedToken = { value: string; expiresAt: number }
let cachedToken: CachedToken | null = null

function base64Url(value: Buffer | string) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return buffer.toString("base64url")
}

export function isPlatformDemoCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_CLIENTI_CALENDAR_ID,
  )
}

export function getPlatformDemoCalendarId() {
  return process.env.GOOGLE_CLIENTI_CALENDAR_ID?.trim() || ""
}

async function getServiceAccountToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  if (!email || !privateKey) throw new Error("google_service_calendar_not_configured")

  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload: Record<string, unknown> = {
    iss: email,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }
  const subject = process.env.GOOGLE_IMPERSONATE_EMAIL?.trim()
  if (subject) payload.sub = subject

  const unsigned = `${header}.${base64Url(JSON.stringify(payload))}`
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey)
  const assertion = `${unsigned}.${base64Url(signature)}`

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  })
  const json = await response.json()
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "google_service_token_failed")
  }

  cachedToken = {
    value: String(json.access_token),
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  }
  return cachedToken.value
}

async function googleJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getServiceAccountToken()
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
  if (response.status === 204) return undefined as T
  const json = await response.json()
  if (!response.ok) throw new Error(json?.error?.message || `google_calendar_${response.status}`)
  return json as T
}

export async function listServiceCalendarEvents(calendarId: string, fromIso: string, toIso: string) {
  const params = new URLSearchParams({
    timeMin: fromIso,
    timeMax: toIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  })
  const json = await googleJson<any>(
    `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  )
  return (json.items || []).map((event: any) => {
    const isPrivate = event.visibility === "private"
    return {
      id: String(event.id || ""),
      title: isPrivate ? "Occupato" : String(event.summary || "Occupato"),
      description: isPrivate ? null : event.description ? String(event.description) : null,
      location: isPrivate ? null : event.location ? String(event.location) : null,
      start: event.start?.dateTime || event.start?.date || null,
      end: event.end?.dateTime || event.end?.date || null,
      allDay: Boolean(event.start?.date && !event.start?.dateTime),
      htmlLink: isPrivate ? null : event.htmlLink || null,
    }
  })
}

export async function createServiceCalendarEvent(
  calendarId: string,
  input: { summary: string; description?: string | null; location?: string | null; startIso: string; endIso: string; timeZone?: string },
) {
  const timeZone = input.timeZone || "Europe/Rome"
  return googleJson<any>(`${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`, {
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

export async function updateServiceCalendarEvent(
  calendarId: string,
  eventId: string,
  input: { summary?: string; description?: string | null; location?: string | null; startIso?: string; endIso?: string; timeZone?: string },
) {
  const timeZone = input.timeZone || "Europe/Rome"
  const body: Record<string, unknown> = {}
  if (input.summary !== undefined) body.summary = input.summary
  if (input.description !== undefined) body.description = input.description || ""
  if (input.location !== undefined) body.location = input.location || ""
  if (input.startIso !== undefined) body.start = { dateTime: input.startIso, timeZone }
  if (input.endIso !== undefined) body.end = { dateTime: input.endIso, timeZone }

  return googleJson<any>(
    `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "PATCH", body: JSON.stringify(body) },
  )
}

export async function deleteServiceCalendarEvent(calendarId: string, eventId: string) {
  await googleJson<void>(
    `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE" },
  )
}
