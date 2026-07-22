import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/superadmin/prospects/assignments
 *
 * Lista delle assegnazioni attive (assigned_agent_id != NULL) ordinate per
 * scadenza crescente. Pensata per la dashboard di monitoraggio scadenze.
 *
 * Query params:
 *  - filter: 'all' | 'expiring_7' | 'expiring_14' | 'no_expiry'
 *  - agent_id: filtra per singolo agente
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const filter = url.searchParams.get("filter") ?? "all"
  const agentId = url.searchParams.get("agent_id")

  const svc = await createServiceRoleClient()
  let q = svc
    .from("prospects")
    .select(
      `id, name, category, city, province, region, assigned_agent_id,
       assignment_date, assignment_expires_at, assignment_duration_days, status,
       assigned_agent:sales_agents!prospects_assigned_agent_id_fkey(
         id, display_name, email, parent_agent_id
       )`,
    )
    .not("assigned_agent_id", "is", null)
    .order("assignment_expires_at", { ascending: true, nullsFirst: false })

  if (agentId) q = q.eq("assigned_agent_id", agentId)

  if (filter === "expiring_7") {
    const limit = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    q = q.not("assignment_expires_at", "is", null).lte("assignment_expires_at", limit)
  } else if (filter === "expiring_14") {
    const limit = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    q = q.not("assignment_expires_at", "is", null).lte("assignment_expires_at", limit)
  } else if (filter === "no_expiry") {
    q = q.is("assignment_expires_at", null)
  }

  const { data, error } = await q.limit(500)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assignments: data ?? [] })
}
