/**
 * Admin: session detail + event timeline for the selected tenant.
 * :sessionId is the browser-issued session_id (text).
 */
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const identity = await getCallerIdentity(req)
  if (!identity) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!identity.propertyId) return NextResponse.json({ error: "no property" }, { status: 400 })

  try {
    await requireAreaApi("tracking", req)
  } catch (e) {
    if (isAreaDenied(e)) return areaDeniedResponse(e)
    throw e
  }

  // See the list route: the selected platform tenant can differ from the
  // superadmin's own admin_users row, so use the service client only after
  // authorization and always constrain reads by the resolved propertyId.
  const supabase = createServiceClient()
  const propertyId = identity.propertyId

  const { data: session, error: sErr } = await supabase
    .from("tracking_sessions")
    .select("*")
    .eq("property_id", propertyId)
    .eq("session_id", sessionId)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 })

  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("id, event_type, event_category, payload, page_url, referrer, created_at")
    .eq("property_id", propertyId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(500)
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  return NextResponse.json({ session, events: events ?? [] })
}
