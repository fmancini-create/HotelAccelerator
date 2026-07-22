import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/prospects/assignment-requests?status=pending|all
 *
 * Lista delle richieste di assegnazione per il superadmin. Default: pending.
 * Joins:
 *   - prospects (display name, citta', regione, categoria, stato attuale)
 *   - sales_agents.display_name dell'agente richiedente
 *   - profiles.first_name+last_name del superadmin che ha deciso (se presente)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const service = await createServiceRoleClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })

  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Solo super_admin" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || "pending"

  let q = service
    .from("prospect_assignment_requests")
    .select(
      "id, prospect_id, agent_id, status, message, decision_notes, created_at, decided_at, decided_by, " +
        "prospects:prospect_id(id, name, city, province, region, category, stars, email, website, phone, status, assigned_agent_id), " +
        "sales_agents:agent_id(id, display_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(500)

  if (status !== "all") {
    q = q.eq("status", status)
  }

  const { data, error } = await q
  if (error) {
    console.error("[superadmin/assignment-requests] GET error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // counts per status (per badge UI)
  const statusList = ["pending", "approved", "rejected", "cancelled"] as const
  const counts: Record<string, number> = {}
  for (const s of statusList) {
    const { count } = await service
      .from("prospect_assignment_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", s)
    counts[s] = count || 0
  }

  return NextResponse.json({ requests: data || [], counts })
}
