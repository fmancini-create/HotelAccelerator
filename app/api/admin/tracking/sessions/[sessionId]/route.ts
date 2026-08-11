/**
 * Admin: session detail + event timeline.
 * :sessionId is the browser-issued session_id (text). We double-check
 * property_id match via admin_users join so one tenant cannot peek at another.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// `req` (non piu' `_req`): serve a far vedere i cookie alla guardia di area.
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })

  const { data: admin } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("email", user.email)
    .maybeSingle()
  if (!admin?.property_id) return NextResponse.json({ error: "no property" }, { status: 403 })

  // Permesso di sezione, convertito subito in 403: senza try/catch attorno al
  // gestore, un'eccezione qui diventerebbe un 500 e mentirebbe sul motivo.
  try {
    await requireAreaApi("tracking", req)
  } catch (e) {
    if (isAreaDenied(e)) return areaDeniedResponse(e)
    throw e
  }

  const { data: session, error: sErr } = await supabase
    .from("tracking_sessions")
    .select("*")
    .eq("property_id", admin.property_id)
    .eq("session_id", sessionId)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 })

  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("id, event_type, event_category, payload, page_url, referrer, created_at")
    .eq("property_id", admin.property_id)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(500)
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  return NextResponse.json({ session, events: events ?? [] })
}
