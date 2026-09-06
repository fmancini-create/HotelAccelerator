/**
 * Admin: list recent tracking sessions for the selected tenant.
 * Accepts ?limit (max 100), ?identified (true|false), ?q (email/session prefix).
 */
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const identity = await getCallerIdentity(req)
  if (!identity) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!identity.propertyId) return NextResponse.json({ error: "no property" }, { status: 400 })

  try {
    await requireAreaApi("tracking", req)
  } catch (e) {
    if (isAreaDenied(e)) return areaDeniedResponse(e)
    throw e
  }

  // Service role is intentional here: a platform superadmin can switch tenant
  // through the platform-context override, while the legacy RLS policy only
  // knows the property_id stored on admin_users. Tenant isolation is enforced
  // explicitly with identity.propertyId after authentication + area guard.
  const supabase = createServiceClient()
  const propertyId = identity.propertyId

  const url = new URL(req.url)
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10)
  const limit = Math.max(1, Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100))
  const identified = url.searchParams.get("identified")
  const q = (url.searchParams.get("q") || "").trim().toLowerCase()

  let query = supabase
    .from("tracking_sessions")
    .select(
      "id, session_id, email, contact_id, anonymous_id, first_seen_at, last_seen_at, event_count, landing_page, last_page, referrer, utm_source, utm_medium, utm_campaign, country, city, device_type, browser, os, site_id",
    )
    .eq("property_id", propertyId)
    .order("last_seen_at", { ascending: false })
    .limit(limit)

  if (identified === "true") query = query.not("email", "is", null)
  else if (identified === "false") query = query.is("email", null)

  if (q) query = query.or(`email.ilike.%${q}%,session_id.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}
