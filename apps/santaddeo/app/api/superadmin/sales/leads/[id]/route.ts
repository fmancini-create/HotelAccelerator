import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * PATCH /api/superadmin/sales/leads/[id]
 *
 * Permette al superadmin di:
 *  - riassegnare il lead a un altro venditore (campo: sales_agent_id)
 *  - cambiare manualmente status (es: registered/converted/rejected)
 *  - aggiornare le note
 *
 * Caso d'uso tipico: un lead arrivato da campagna marketing va manualmente
 * assegnato a un venditore. Oppure un lead duplicato va spostato.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const allowed: Record<string, true> = {
    sales_agent_id: true,
    status: true,
    notes: true,
    rejected_reason: true,
    first_name: true,
    last_name: true,
    hotel_name: true,
    phone: true,
  }
  const update: Record<string, any> = {}
  for (const k of Object.keys(body)) {
    if (allowed[k]) update[k] = body[k]
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "no_updatable_fields" }, { status: 400 })

  const svc = await createServiceRoleClient()

  // Se sto riassegnando, verifico che il nuovo agente esista.
  if (update.sales_agent_id) {
    const { data: agent } = await svc
      .from("sales_agents")
      .select("id")
      .eq("id", update.sales_agent_id)
      .maybeSingle()
    if (!agent)
      return NextResponse.json({ error: "agent_not_found" }, { status: 400 })
  }

  const { data: lead, error } = await svc
    .from("sales_leads")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    // Vincolo UNIQUE(sales_agent_id, email): se l'altro agente ha gia' lo stesso lead
    if (String(error.code) === "23505") {
      return NextResponse.json(
        { error: "duplicate_lead", details: "Questo agente ha gia' un lead con questa email." },
        { status: 409 },
      )
    }
    console.error("[superadmin/sales/leads/PATCH] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  return NextResponse.json({ lead })
}

/**
 * DELETE /api/superadmin/sales/leads/[id]
 *
 * Eliminazione lead. Se il lead era convertito (hotel_id non null) elimina
 * SOLO il record lead, l'hotel resta. Per scollegare anche l'associazione
 * sales_agent_hotels usare l'endpoint dedicato.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params

  const svc = await createServiceRoleClient()
  const { error } = await svc.from("sales_leads").delete().eq("id", id)
  if (error) {
    console.error("[superadmin/sales/leads/DELETE] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
