import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/invitations
 *
 * Ritorna gli inviti venditore PENDENTI (accepted_at IS NULL).
 * Ordinati per data di creazione discendente.
 */
export async function GET() {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("sales_agent_invitations")
    .select(
      // approval_status + invited_by_agent + rejection_reason servono al
      // pannello "in attesa di approvazione".
      "id, email, display_name, default_commission_percentage, invited_by_name, expires_at, email_sent_count, email_last_sent_at, email_last_error, created_at, approval_status, approved_at, rejection_reason, invited_by_agent_id, parent_agent_id",
    )
    .is("accepted_at", null)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[superadmin/sales/invitations/GET] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  // Risolvi i nomi dei capi area per le righe pendenti. Una sola query
  // batched invece di una join (sales_agent_invitations non ha FK formale
  // verso sales_agents in PostgREST schema cache).
  const inviterAgentIds = Array.from(
    new Set(
      (data ?? [])
        .map((r: { invited_by_agent_id?: string | null }) => r.invited_by_agent_id)
        .filter((v): v is string => !!v),
    ),
  )
  let inviterAgents: Record<string, { display_name: string | null; email: string }> = {}
  if (inviterAgentIds.length > 0) {
    const { data: agents } = await svc
      .from("sales_agents")
      .select("id, display_name, email")
      .in("id", inviterAgentIds)
    inviterAgents = Object.fromEntries(
      (agents ?? []).map((a: { id: string; display_name: string | null; email: string }) => [
        a.id,
        { display_name: a.display_name, email: a.email },
      ]),
    )
  }
  const enriched = (data ?? []).map((row: { invited_by_agent_id?: string | null }) => ({
    ...row,
    invited_by_agent: row.invited_by_agent_id ? inviterAgents[row.invited_by_agent_id] ?? null : null,
  }))
  return NextResponse.json({ invitations: enriched })
}
