import { NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import {
  analyticsIngestKeyFor,
  constantTimeTokenMatches,
  insertSuiteAnalyticsEvents,
  isSuiteAnalyticsPlatform,
  type SuiteAnalyticsIngestEvent,
} from "@/lib/platform/suite-analytics"

const MAX_EVENTS = 50
const MAX_BODY_BYTES = 64 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") || "0")
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload troppo grande" }, { status: 413 })
  }

  const body = await request.json().catch(() => null)
  const platformKey = body?.platformKey
  if (!isSuiteAnalyticsPlatform(platformKey)) {
    return NextResponse.json({ error: "Piattaforma non valida" }, { status: 400 })
  }

  const rawEvents = Array.isArray(body?.events) ? body.events : []
  if (rawEvents.length < 1 || rawEvents.length > MAX_EVENTS) {
    return NextResponse.json({ error: `Sono ammessi da 1 a ${MAX_EVENTS} eventi per richiesta` }, { status: 400 })
  }

  let identity = null
  if (platformKey === "hotelaccelerator" && sameOrigin(request)) {
    identity = await getCallerIdentity(request)
  } else {
    const token = request.headers.get("x-suite-analytics-key")
    if (!constantTimeTokenMatches(analyticsIngestKeyFor(platformKey), token)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }
  }

  const events: SuiteAnalyticsIngestEvent[] = []
  for (const raw of rawEvents) {
    if (!raw || typeof raw !== "object") continue
    const surface = raw.surface === "backend" ? "backend" : raw.surface === "public" ? "public" : null
    const eventType = text(raw.eventType, 100)
    const visitorId = text(raw.visitorId, 160)
    const sessionId = text(raw.sessionId, 160)
    if (!surface || !eventType || !visitorId || !sessionId) continue

    if (platformKey === "hotelaccelerator" && surface === "backend" && !identity) {
      return NextResponse.json({ error: "Il tracking back-end richiede un utente autenticato" }, { status: 401 })
    }

    const verifiedBackend = platformKey === "hotelaccelerator" && surface === "backend" && identity
    const suppliedEventId = text(raw.eventId, 100)
    events.push({
      platformKey,
      surface,
      eventType,
      eventName: text(raw.eventName, 160),
      eventId: suppliedEventId && UUID.test(suppliedEventId) ? suppliedEventId : undefined,
      eventVersion: Number.isInteger(raw.eventVersion) ? raw.eventVersion : 1,
      occurredAt: text(raw.occurredAt, 60) ?? undefined,
      visitorId: verifiedBackend ? `user:${identity.userId}` : visitorId,
      sessionId,
      actorUserId: verifiedBackend ? identity.userId : text(raw.actorUserId, 200),
      actorEmail: verifiedBackend ? identity.email : text(raw.actorEmail, 320),
      tenantId: verifiedBackend ? identity.propertyId : text(raw.tenantId, 200),
      pagePath: text(raw.pagePath, 2000),
      pageTitle: text(raw.pageTitle, 500),
      referrer: text(raw.referrer, 2000),
      utmSource: text(raw.utmSource, 300),
      utmMedium: text(raw.utmMedium, 300),
      utmCampaign: text(raw.utmCampaign, 300),
      utmContent: text(raw.utmContent, 300),
      utmTerm: text(raw.utmTerm, 300),
      country: text(raw.country, 120),
      city: text(raw.city, 160),
      deviceType: text(raw.deviceType, 80),
      browser: text(raw.browser, 120),
      os: text(raw.os, 120),
      language: text(raw.language, 50),
      clientTimezone: text(raw.clientTimezone, 100),
      screenWidth: Number.isInteger(raw.screenWidth) ? raw.screenWidth : null,
      screenHeight: Number.isInteger(raw.screenHeight) ? raw.screenHeight : null,
      correlationId: text(raw.correlationId, 200),
      identitySource: verifiedBackend ? "verified" : platformKey === "hotelaccelerator" ? "anonymous" : raw.identitySource === "verified" ? "verified" : "client",
      metadata: raw.metadata,
    })
  }

  if (events.length === 0) return NextResponse.json({ error: "Nessun evento valido" }, { status: 400 })

  try {
    await insertSuiteAnalyticsEvents(events)
    return NextResponse.json({ accepted: events.length }, { status: 202 })
  } catch (error) {
    console.error("[suite-analytics] ingest failed", error)
    return NextResponse.json({ error: "Telemetria non registrata" }, { status: 500 })
  }
}
