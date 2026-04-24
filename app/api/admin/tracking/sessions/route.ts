/**
 * Admin: list recent tracking sessions for the caller's tenant.
 * Accepts ?limit (max 100), ?identified (true|false), ?q (email/session prefix).
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
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
    .eq("property_id", admin.property_id)
    .order("last_seen_at", { ascending: false })
    .limit(limit)

  if (identified === "true") query = query.not("email", "is", null)
  else if (identified === "false") query = query.is("email", null)

  if (q) query = query.or(`email.ilike.%${q}%,session_id.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}
