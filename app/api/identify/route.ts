/**
 * Tracking identify: POST /api/identify
 *
 * Called by the browser tracker when a visitor submits a form / logs in and
 * exposes an email. We:
 *   1. Authenticate with the public write_key + origin (same as /api/track).
 *   2. Delegate contact creation to the CRM auto-capture policy, so the
 *      tenant's toggles and blacklists are respected consistently with
 *      inbound email.
 *   3. Upsert the session and attach contact_id + email.
 *   4. Emit an "identify" event row so the CRM timeline shows the moment.
 *
 * Back-compat: the route used to accept {tenant_id, session_id, utm_*} and
 * write an event row only. The new contract adds {key, email, traits, utm}.
 * The old shape still works: callers that sent {tenant_id} without a key will
 * be rejected with 401 and should be migrated to use a write_key.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { authenticateTrackingRequest, corsHeaders, getClientIp } from "@/lib/tracking/auth"
import { upsertSession } from "@/lib/tracking/sessions"
import { autoCaptureContact } from "@/lib/crm/auto-capture"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface IdentifyPayload {
  key?: string
  session_id: string
  anonymous_id?: string
  email?: string
  name?: string
  phone?: string
  page_url?: string
  referrer?: string
  traits?: Record<string, unknown>
  utm?: {
    source?: string
    medium?: string
    campaign?: string
    content?: string
    term?: string
  }
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) })
}

export async function POST(req: NextRequest) {
  const originIn = req.headers.get("origin")

  let body: IdentifyPayload
  try {
    body = (await req.json()) as IdentifyPayload
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: corsHeaders(originIn) })
  }

  if (!body.session_id) {
    return NextResponse.json(
      { error: "missing session_id" },
      { status: 400, headers: corsHeaders(originIn) },
    )
  }

  const auth = await authenticateTrackingRequest(req, body.key)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: corsHeaders(originIn) })
  }
  const { site, origin } = auth

  const supabase = createServiceClient()

  // 1) Stitch a CRM contact if an email was provided. The policy layer decides
  //    whether to create / update / skip based on tenant settings; we always
  //    receive a contactId back when one exists (or was created) so we can
  //    stitch it to the session.
  let contactId: string | null = null
  if (body.email) {
    try {
      const res = await autoCaptureContact({
        supabase,
        propertyId: site.propertyId,
        email: body.email,
        name: body.name ?? null,
        direction: "inbound",
      })
      contactId = res.contactId ?? null
    } catch (e) {
      console.error("[identify] auto-capture failed", e)
    }
  }

  // 2) Upsert the session with identity + UTM first-touch.
  let sessionRowId: string | null = null
  try {
    const res = await upsertSession(supabase, {
      propertyId: site.propertyId,
      siteId: site.siteId,
      sessionId: body.session_id,
      anonymousId: body.anonymous_id ?? null,
      contactId,
      email: body.email ?? null,
      pageUrl: body.page_url ?? null,
      referrer: body.referrer ?? req.headers.get("referer"),
      utm: body.utm,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      country: req.headers.get("x-vercel-ip-country"),
      city: req.headers.get("x-vercel-ip-city"),
      incrementEvents: 1,
    })
    sessionRowId = res.id
  } catch (e) {
    console.error("[identify] session upsert failed", e)
  }

  // 3) Emit an explicit identify event for the timeline.
  try {
    await supabase.from("events").insert({
      property_id: site.propertyId,
      site_id: site.siteId,
      session_id: body.session_id,
      anonymous_id: body.anonymous_id ?? null,
      contact_id: contactId,
      event_type: "identify",
      event_category: "identity",
      payload: {
        email: body.email ?? null,
        name: body.name ?? null,
        phone: body.phone ?? null,
        traits: body.traits ?? {},
        utm: body.utm ?? {},
      },
      page_url: body.page_url ?? null,
      referrer: body.referrer ?? req.headers.get("referer"),
      ip_address: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    })
  } catch (e) {
    console.error("[identify] event insert failed", e)
  }

  return NextResponse.json(
    {
      success: true,
      session_id: body.session_id,
      session_row_id: sessionRowId,
      contact_id: contactId,
    },
    { status: 200, headers: corsHeaders(origin) },
  )
}
