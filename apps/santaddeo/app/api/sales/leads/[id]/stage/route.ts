import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { recordLeadActivity } from "@/lib/sales/lead-messages"

export const dynamic = "force-dynamic"

const STAGES = ["new", "contacted", "demo", "negotiation", "won", "lost"] as const
const STAGE_LABEL: Record<string, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  demo: "Demo",
  negotiation: "Negoziazione",
  won: "Vinto",
  lost: "Perso",
}

/**
 * PATCH /api/sales/leads/[id]/stage
 * Aggiorna lo stadio pipeline del lead e registra un'attivita' nella timeline.
 * Ownership: il venditore agisce solo sui propri lead; il super admin su tutti.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const stage = String(body?.stage ?? "").trim()
  if (!STAGES.includes(stage as (typeof STAGES)[number])) {
    return NextResponse.json({ error: "invalid_stage" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const { data: lead, error: leadErr } = await svc
    .from("sales_leads")
    .select("id, pipeline_stage, sales_agent_id, sales_agents!inner(user_id)")
    .eq("id", id)
    .maybeSingle()
  if (leadErr) return NextResponse.json({ error: "db_error" }, { status: 500 })
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const agent = (lead as any).sales_agents
  if (profile.role !== "super_admin" && agent?.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const prev = lead.pipeline_stage ?? "new"
  if (prev === stage) return NextResponse.json({ ok: true, unchanged: true })

  const { error: updErr } = await svc
    .from("sales_leads")
    .update({ pipeline_stage: stage, stage_updated_at: new Date().toISOString() })
    .eq("id", id)
  if (updErr) return NextResponse.json({ error: "db_error", details: updErr.message }, { status: 500 })

  await recordLeadActivity({
    svc,
    leadId: id,
    salesAgentId: lead.sales_agent_id,
    createdBy: user.id,
    type: "stage_change",
    content: `Stadio cambiato: ${STAGE_LABEL[prev] ?? prev} → ${STAGE_LABEL[stage] ?? stage}`,
    metadata: { from: prev, to: stage },
  })

  return NextResponse.json({ ok: true, stage })
}
