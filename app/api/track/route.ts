/**
 * Tracking ingestion: POST /api/track
 *
 * Accepts an array of events (batched from the tracker.js beacon) or a single
 * event. Authenticated by the public write_key on the tracking_site row;
 * Origin must match the site's allow list.
 *
 * Responsibilities:
 *   - CORS preflight (OPTIONS) + write (POST).
 *   - Upsert tracking_session with UTM first-touch and last-seen.
 *   - Insert each event row with property_id and site_id taken from the
 *     *server-side* lookup, never from client input. This closes the spoof
 *     vector where a malicious caller could send a stolen key + a forged
 *     property_id to plant events in another tenant.
 *   - Return 202 on success (write is fire-and-forget semantics for the
 *     browser, so 202 signals "accepted, may be processed async").
 *
 * GET /api/track continues to serve a 1x1 pixel for <noscript> fallback. It
 * re-uses the same auth (write_key in query-string, origin from Referer).
 */
import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  authenticateTrackingRequest,
  corsHeaders,
  getClientIp,
  getTrackingSiteByKey,
  isOriginAllowed,
  normaliseOrigin,
} from "@/lib/tracking/auth"
import { upsertSession } from "@/lib/tracking/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type EventInput = {
  event_type: string
  event_category?: string
  session_id: string
  anonymous_id?: string
  page_url?: string
  referrer?: string
  payload?: Record<string, unknown>
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
  }
}

type TrackRequest = {
  key?: string
  events: EventInput[]
}

const CATEGORY_MAP: Record<string, string> = {
  page_view: "navigation",
  scroll_depth: "navigation",
  session_start: "session",
  session_end: "session",
  search_dates: "booking",
  room_interest: "booking",
  booking_start: "booking",
  form_submit: "engagement",
  chat_open: "engagement",
  chat_message: "engagement",
  cta_click: "engagement",
}

function categorize(eventType: string, provided?: string): string {
  if (provided) return provided
  return CATEGORY_MAP[eventType] ?? "custom"
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) })
}

export async function POST(req: NextRequest) {
  const originIn = req.headers.get("origin")

  let body: TrackRequest
  try {
    body = (await req.json()) as TrackRequest
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: corsHeaders(originIn) })
  }

  const auth = await authenticateTrackingRequest(req, body.key)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: corsHeaders(originIn) })
  }

  const { site, origin } = auth
  const events = Array.isArray(body.events) ? body.events : []
  if (events.length === 0) {
    return NextResponse.json({ error: "no events" }, { status: 400, headers: corsHeaders(origin) })
  }
  if (events.length > 50) {
    return NextResponse.json(
      { error: "too many events in batch (max 50)" },
      { status: 413, headers: corsHeaders(origin) },
    )
  }

  const supabase = createServiceClient()
  const ua = req.headers.get("user-agent")
  const ip = getClientIp(req)
  const country = req.headers.get("x-vercel-ip-country") || null
  const city = req.headers.get("x-vercel-ip-city") || null

  // Group by session_id so we upsert the session once per batch.
  const sessionBuckets = new Map<string, EventInput[]>()
  for (const ev of events) {
    if (!ev?.session_id || !ev.event_type) continue
    const list = sessionBuckets.get(ev.session_id) ?? []
    list.push(ev)
    sessionBuckets.set(ev.session_id, list)
  }

  const inserted: string[] = []
  for (const [sessionId, bucket] of sessionBuckets) {
    const first = bucket[0]!
    const pageFromBatch = bucket.find((e) => e.page_url)?.page_url ?? null
    const utmFromBatch = bucket.find((e) => e.utm)?.utm

    try {
      await upsertSession(supabase, {
        propertyId: site.propertyId,
        siteId: site.siteId,
        sessionId,
        anonymousId: first.anonymous_id ?? null,
        pageUrl: pageFromBatch,
        referrer: first.referrer ?? req.headers.get("referer"),
        utm: utmFromBatch,
        ipAddress: ip,
        userAgent: ua,
        country,
        city,
        incrementEvents: bucket.length,
      })
    } catch (e) {
      console.error("[track] session upsert failed", e)
      // continue: we still want to record events even if session upgrade hiccups
    }

    const rows = bucket.map((ev) => ({
      property_id: site.propertyId,
      site_id: site.siteId,
      session_id: sessionId,
      anonymous_id: ev.anonymous_id ?? null,
      event_type: String(ev.event_type).slice(0, 64),
      event_category: categorize(ev.event_type, ev.event_category),
      payload: ev.payload ?? {},
      page_url: ev.page_url ?? null,
      referrer: ev.referrer ?? null,
      ip_address: ip,
      user_agent: ua,
    }))

    const { data, error } = await supabase.from("events").insert(rows).select("id")
    if (error) {
      console.error("[track] event insert failed", error)
      continue
    }
    data?.forEach((r: { id: string }) => inserted.push(r.id))
  }

  return NextResponse.json(
    { success: true, accepted: inserted.length },
    { status: 202, headers: corsHeaders(origin) },
  )
}

// ---- GET /api/track: 1x1 pixel fallback for <noscript> -----------------------
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const key = url.searchParams.get("k")
  const sessionId = url.searchParams.get("s")
  const eventType = url.searchParams.get("e")

  // Always return a pixel even on failure: noscript tags cannot surface errors.
  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
  const pixelHeaders: Record<string, string> = {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  }

  if (!key || !sessionId || !eventType) return new NextResponse(pixel, { headers: pixelHeaders })

  const site = await getTrackingSiteByKey(key)
  if (!site || !site.isActive) return new NextResponse(pixel, { headers: pixelHeaders })

  const origin = normaliseOrigin(req.headers.get("referer"))
  if (!origin || !isOriginAllowed(origin, site.allowedOrigins)) {
    return new NextResponse(pixel, { headers: pixelHeaders })
  }

  const supabase = createServiceClient()
  const ip = getClientIp(req)
  const ua = req.headers.get("user-agent")
  const pageUrl = url.searchParams.get("u")

  try {
    await upsertSession(supabase, {
      propertyId: site.propertyId,
      siteId: site.siteId,
      sessionId,
      pageUrl,
      referrer: req.headers.get("referer"),
      ipAddress: ip,
      userAgent: ua,
      country: req.headers.get("x-vercel-ip-country"),
      city: req.headers.get("x-vercel-ip-city"),
      incrementEvents: 1,
    })
    await supabase.from("events").insert({
      property_id: site.propertyId,
      site_id: site.siteId,
      session_id: sessionId,
      event_type: eventType.slice(0, 64),
      event_category: categorize(eventType),
      payload: {},
      page_url: pageUrl,
      referrer: req.headers.get("referer"),
      ip_address: ip,
      user_agent: ua,
    })
  } catch (e) {
    console.error("[track/pixel] write failed", e)
  }

  return new NextResponse(pixel, { headers: pixelHeaders })
}
