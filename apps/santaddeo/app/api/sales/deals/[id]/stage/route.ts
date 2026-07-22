import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { syncProspectStatusFromDeal } from "../route"

export const dynamic = "force-dynamic"

const VALID_STAGES = [
  "lead", "contacted", "demo_scheduled", "demo_done", 
  "proposal", "negotiation", "won", "lost"
]

/**
 * PATCH /api/sales/deals/[id]/stage
 * Cambio rapido stage (per drag & drop)
 * Body: { stage: "demo_scheduled" }
 */
export async function PATCH(
  request: NextRequest,
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

  // Verifica esistenza e permessi (carica prospect_id per sync downstream)
  const { data: existing } = await svc
    .from("deals")
    .select("id, agent_id, stage, prospect_id")
    .eq("id", id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  if (!isSuperAdmin && existing.agent_id !== agent?.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const newStage = body.stage

  if (!newStage || !VALID_STAGES.includes(newStage)) {
    return NextResponse.json({ 
      error: "stage non valido", 
      valid_stages: VALID_STAGES 
    }, { status: 400 })
  }

  // Se lo stage non è cambiato, non fare nulla
  if (existing.stage === newStage) {
    return NextResponse.json({ deal: existing, changed: false })
  }

  // Il trigger nel DB aggiornerà automaticamente stage_changed_at, 
  // last_activity_at e closed_at se necessario
  const { data: deal, error } = await svc
    .from("deals")
    .update({ 
      stage: newStage,
      // Se passa a lost, potrebbe servire lost_reason - lo gestiamo dopo
      lost_reason: newStage === "lost" ? body.lost_reason || null : null,
    })
    .eq("id", id)
    .select(`
      *,
      agent:agent_id (id, display_name, email),
      hotel:hotel_id (id, name),
      lead:lead_id (id, name, email),
      prospect:prospect_id (id, name, city, region, status)
    `)
    .single()

  if (error) {
    console.error("[sales/deals/stage] PATCH error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // Sincronizza prospect.status se il deal è collegato a un prospect
  await syncProspectStatusFromDeal(svc, existing.prospect_id, existing.stage, newStage)

  return NextResponse.json({ deal, changed: true, previous_stage: existing.stage })
}
