import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/prospects/[id]
 * Dettaglio singolo prospect.
 * Permessi: superadmin (qualsiasi prospect) oppure agent assegnato.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  const svc = await createServiceRoleClient()

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  const { data: prospect, error } = await svc
    .from("prospects")
    .select(`
      id, name, category, stars, address, city, province, region, postal_code, country,
      latitude, longitude, phone, email, website,
      google_place_id, google_rating, google_reviews_count, google_photos_url, google_formatted_address,
      rooms_count, beds_count,
      assigned_agent_id, assignment_date, assignment_expires_at, assignment_duration_days, status, notes, last_contact_at,
      source, source_id, created_at, updated_at,
      agent:assigned_agent_id (id, display_name, email)
    `)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[sales/prospects/:id] GET error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  if (!prospect) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Permessi: superadmin oppure agent assegnato
  if (!isSuperAdmin && prospect.assigned_agent_id !== agent?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Lista deal collegati a questo prospect
  const { data: linkedDeals } = await svc
    .from("deals")
    .select("id, prospect_name, stage, estimated_value, probability, last_activity_at, created_at, agent_id, agent:agent_id (id, display_name, email)")
    .eq("prospect_id", id)
    .order("created_at", { ascending: false })

  return NextResponse.json({ prospect, linked_deals: linkedDeals || [] })
}
