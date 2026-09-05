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
const GOOGLE_DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files"

function googleClientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("google_oauth_not_configured")
  return { clientId, clientSecret }
}

export function getCalendarOAuthRedirectUri() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${baseUrl}/api/channels/email/oauth/callback`
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
      "https://www.googleapis.com/auth/drive.file",
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

export type CalendarAttendee = {
  email: string
  displayName?: string | null
  responseStatus?: string | null
}

export type CalendarAttachment = {
  fileUrl: string
  title: string
  mimeType: string | null
  fileId?: string | null
}

export type CalendarEventInput = {
  summary: string
  description?: string | null
  location?: string | null
  startIso: string
  endIso: string
  timeZone?: string
  attendees?: CalendarAttendee[]
  attachments?: CalendarAttachment[]
  recurrence?: string[]
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
  attendees: CalendarAttendee[]
  attachments: CalendarAttachment[]
  recurringEventId: string | null
}

function mapCalendarEvent(ev: any): CalendarEvent {
  const isPrivate = ev.visibility === "private"
  return {
    id: String(ev.id || ""),
    title: isPrivate ? "Occupato" : String(ev.summary || "Occupato"),
    description: isPrivate ? null : ev.description ? String(ev.description) : null,
    location: isPrivate ? null : ev.location ? String(ev.location) : null,
    start: ev.start?.dateTime || ev.start?.date || null,
    end: ev.end?.dateTime || ev.end?.date || null,
    allDay: Boolean(ev.start?.date && !ev.start?.dateTime),
    htmlLink: isPrivate ? null : ev.htmlLink || null,
    attendees: isPrivate
      ? []
      : (ev.attendees || []).map((attendee: any) => ({
          email: String(attendee.email || ""),
          displayName: attendee.displayName ? String(attendee.displayName) : null,
          responseStatus: attendee.responseStatus ? String(attendee.responseStatus) : null,
        })).filter((attendee: CalendarAttendee) => attendee.email),
    attachments: isPrivate
      ? []
      : (ev.attachments || []).map((attachment: any) => ({
          fileUrl: String(attachment.fileUrl || ""),
          title: String(attachment.title || "Allegato"),
          mimeType: attachment.mimeType ? String(attachment.mimeType) : null,
          fileId: attachment.fileId ? String(attachment.fileId) : null,
        })).filter((attachment: CalendarAttachment) => attachment.fileUrl),
    recurringEventId: ev.recurringEventId ? String(ev.recurringEventId) : null,
  }
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
  return (json.items || []).map(mapCalendarEvent)
}

function eventBody(input: Partial<CalendarEventInput>) {
  const timeZone = input.timeZone || "Europe/Rome"
  const body: Record<string, unknown> = {}
  if (input.summary !== undefined) body.summary = input.summary
  if (input.description !== undefined) body.description = input.description || ""
  if (input.location !== undefined) body.location = input.location || ""
  if (input.startIso !== undefined) body.start = { dateTime: input.startIso, timeZone }
  if (input.endIso !== undefined) body.end = { dateTime: input.endIso, timeZone }
  if (input.attendees !== undefined) body.attendees = input.attendees.map((attendee) => ({ email: attendee.email }))
  if (input.attachments !== undefined) {
    body.attachments = input.attachments.map((attachment) => ({
      fileUrl: attachment.fileUrl,
      title: attachment.title,
      ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
    }))
  }
  if (input.recurrence !== undefined) body.recurrence = input.recurrence
  return body
}

function eventMutationUrl(calendarId: string, eventId?: string, supportsAttachments = false) {
  const params = new URLSearchParams({ sendUpdates: "all" })
  if (supportsAttachments) params.set("supportsAttachments", "true")
  const base = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events`
  return `${eventId ? `${base}/${encodeURIComponent(eventId)}` : base}?${params.toString()}`
}

export async function createGoogleCalendarEvent(accessToken: string, calendarId: string, input: CalendarEventInput) {
  return googleJson<any>(accessToken, eventMutationUrl(calendarId, undefined, input.attachments !== undefined), {
    method: "POST",
    body: JSON.stringify(eventBody(input)),
  })
}

export async function updateGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string, input: Partial<CalendarEventInput>) {
  return googleJson<any>(accessToken, eventMutationUrl(calendarId, eventId, input.attachments !== undefined), {
    method: "PATCH",
    body: JSON.stringify(eventBody(input)),
  })
}

export async function deleteGoogleCalendarEvent(accessToken: string, calendarId: string, eventId: string) {
  await googleJson<void>(accessToken, eventMutationUrl(calendarId, eventId), { method: "DELETE" })
}

export async function uploadGoogleDriveAttachment(accessToken: string, file: File): Promise<CalendarAttachment> {
  const boundary = `hotelaccelerator_${crypto.randomUUID()}`
  const metadata = JSON.stringify({ name: file.name })
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
    await file.arrayBuffer(),
    `\r\n--${boundary}--`,
  ])
  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: "id,name,mimeType,webViewLink",
  })
  const response = await fetch(`${GOOGLE_DRIVE_UPLOAD_API}?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
    cache: "no-store",
  })
  const json = await response.json()
  if (!response.ok || !json.id || !json.webViewLink) {
    const message = String(json?.error?.message || json?.error_description || `google_drive_${response.status}`)
    if (/insufficient authentication scopes/i.test(message)) throw new Error("google_drive_reconnect_required")
    if (/has not been used|is disabled|accessnotconfigured/i.test(message)) throw new Error("google_drive_api_disabled")
    throw new Error(message)
  }
  return {
    fileUrl: String(json.webViewLink),
    title: String(json.name || file.name),
    mimeType: json.mimeType ? String(json.mimeType) : file.type || null,
    fileId: String(json.id),
  }
}
