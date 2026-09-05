import "server-only"

import type { NextRequest } from "next/server"
import { createHash, randomUUID } from "crypto"

import { createServiceClient } from "@/lib/supabase/server"

export const SUITE_ANALYTICS_PLATFORMS = [
  "hotelaccelerator",
  "santaddeo",
  "hotelprofitai",
  "manubot",
  "4bid",
  "daynext",
] as const

export type SuiteAnalyticsPlatform = (typeof SUITE_ANALYTICS_PLATFORMS)[number]
export type SuiteAnalyticsSurface = "public" | "backend"

export interface SuiteAnalyticsIngestEvent {
  eventId?: string
  eventVersion?: number
  platformKey: SuiteAnalyticsPlatform
  surface: SuiteAnalyticsSurface
  eventType: string
  eventName?: string | null
  occurredAt?: string
  visitorId: string
  sessionId: string
  actorUserId?: string | null
  actorEmail?: string | null
  tenantId?: string | null
  pagePath?: string | null
  pageTitle?: string | null
  referrer?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  country?: string | null
  city?: string | null
  deviceType?: string | null
  browser?: string | null
  os?: string | null
  language?: string | null
  clientTimezone?: string | null
  screenWidth?: number | null
  screenHeight?: number | null
  correlationId?: string | null
  identitySource?: "anonymous" | "client" | "verified"
  metadata?: Record<string, unknown>
}

export function isSuiteAnalyticsPlatform(value: unknown): value is SuiteAnalyticsPlatform {
  return typeof value === "string" && (SUITE_ANALYTICS_PLATFORMS as readonly string[]).includes(value)
}

export function analyticsIngestKeyFor(platform: SuiteAnalyticsPlatform): string | undefined {
  const suffix: Record<SuiteAnalyticsPlatform, string> = {
    hotelaccelerator: "HA",
    santaddeo: "SNT",
    hotelprofitai: "HPA",
    manubot: "MB",
    "4bid": "4BID",
    daynext: "DAYNEXT",
  }
  return process.env[`SUITE_ANALYTICS_INGEST_KEY_${suffix[platform]}`]
}

export function constantTimeTokenMatches(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual) return false
  const a = createHash("sha256").update(expected).digest()
  const b = createHash("sha256").update(actual).digest()
  return a.length === b.length && Buffer.compare(a, b) === 0
}

export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed)
      return `${u.pathname}${u.search}`.slice(0, 2000)
    }
  } catch {
    return trimmed.slice(0, 2000)
  }
  return trimmed.slice(0, 2000)
}

export function scrubMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const blocked = /password|passcode|token|secret|authorization|cookie|card|iban|credit|body|payload|message|content/i
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (blocked.test(key)) continue
    if (typeof value === "string") out[key] = value.slice(0, 500)
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value
  }
  return out
}

export async function insertSuiteAnalyticsEvents(events: SuiteAnalyticsIngestEvent[]): Promise<void> {
  if (events.length === 0) return
  const supabase = createServiceClient()
  const rows = events.map((event) => ({
    event_id: event.eventId ?? randomUUID(),
    event_version: event.eventVersion ?? 1,
    platform_key: event.platformKey,
    surface: event.surface,
    event_type: event.eventType.slice(0, 100),
    event_name: event.eventName?.slice(0, 160) ?? null,
    occurred_at: event.occurredAt ?? new Date().toISOString(),
    visitor_id: event.visitorId.slice(0, 160),
    session_id: event.sessionId.slice(0, 160),
    actor_user_id: event.actorUserId?.slice(0, 200) ?? null,
    actor_email: event.actorEmail?.slice(0, 320) ?? null,
    tenant_id: event.tenantId?.slice(0, 200) ?? null,
    page_path: normalizePath(event.pagePath),
    page_title: event.pageTitle?.slice(0, 500) ?? null,
    referrer: normalizePath(event.referrer),
    utm_source: event.utmSource?.slice(0, 300) ?? null,
    utm_medium: event.utmMedium?.slice(0, 300) ?? null,
    utm_campaign: event.utmCampaign?.slice(0, 300) ?? null,
    utm_content: event.utmContent?.slice(0, 300) ?? null,
    utm_term: event.utmTerm?.slice(0, 300) ?? null,
    country: event.country?.slice(0, 120) ?? null,
    city: event.city?.slice(0, 160) ?? null,
    device_type: event.deviceType?.slice(0, 80) ?? null,
    browser: event.browser?.slice(0, 120) ?? null,
    os: event.os?.slice(0, 120) ?? null,
    language: event.language?.slice(0, 50) ?? null,
    client_timezone: event.clientTimezone?.slice(0, 100) ?? null,
    screen_width: Number.isInteger(event.screenWidth) ? event.screenWidth : null,
    screen_height: Number.isInteger(event.screenHeight) ? event.screenHeight : null,
    correlation_id: event.correlationId?.slice(0, 200) ?? null,
    identity_source: event.identitySource ?? "anonymous",
    metadata: scrubMetadata(event.metadata),
  }))

  const { error } = await supabase.from("platform_analytics_events").upsert(rows, {
    onConflict: "event_id",
    ignoreDuplicates: true,
  })
  if (error) throw error
}

export async function trackHotelAcceleratorServerRequest(request: NextRequest, input: {
  actorUserId: string
  actorEmail: string
  tenantId?: string | null
  action?: string | null
}): Promise<void> {
  const pathname = request.nextUrl.pathname
  const isBackend = pathname.startsWith("/api/") || pathname.startsWith("/admin/") || pathname.startsWith("/super-admin/")
  if (!isBackend) return

  const visitor = `user:${input.actorUserId}`
  const sessionId = request.headers.get("x-ha-analytics-session") || visitor
  await insertSuiteAnalyticsEvents([
    {
      platformKey: "hotelaccelerator",
      surface: "backend",
      eventType: pathname.startsWith("/api/") ? "api_request" : "page_view",
      eventName: input.action ?? `${request.method} ${pathname}`,
      occurredAt: new Date().toISOString(),
      visitorId: visitor,
      sessionId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      tenantId: input.tenantId ?? null,
      pagePath: pathname,
      correlationId: request.headers.get("x-correlation-id"),
      identitySource: "verified",
      metadata: {
        method: request.method,
      },
    },
  ])
}
