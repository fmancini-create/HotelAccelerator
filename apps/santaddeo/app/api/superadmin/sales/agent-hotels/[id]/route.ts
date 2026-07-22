import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * PATCH /api/superadmin/sales/agent-hotels/[id]
 *
 * Aggiorna l'associazione: % commissione, permessi granulari, lead_status,
 * commission_basis, note. Usato dal superadmin per configurare ogni
 * struttura di un agente.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const allowed: Record<string, true> = {
    commission_percentage: true,
    commission_basis: true,
    lead_status: true,
    can_view_subscription: true,
    can_view_payments: true,
    can_view_metrics: true,
    can_view_full_dashboard: true,
    activated_at: true,
    notes: true,
  }
  const update: Record<string, any> = {}
  for (const k of Object.keys(body)) {
    if (allowed[k]) update[k] = body[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_updatable_fields" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("sales_agent_hotels")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("[superadmin/sales/agent-hotels/PATCH] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  return NextResponse.json({ association: data })
}

/**
 * DELETE /api/superadmin/sales/agent-hotels/[id]
 *
 * Rimuove l'associazione (l'hotel resta, ma non e' piu' linkato all'agente).
 * Usato per riassegnazioni o errori di attribuzione.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error
  const { id } = await ctx.params

  const svc = await createServiceRoleClient()

  // Recupera l'associazione prima di cancellarla, per poter rimuovere anche
  // il grant RevMan collegato (chiavi diverse: vedi POST). Best-effort.
  const { data: assoc } = await svc
    .from("sales_agent_hotels")
    .select("sales_agent_id, hotel_id")
    .eq("id", id)
    .maybeSingle()

  const { error } = await svc.from("sales_agent_hotels").delete().eq("id", id)
  if (error) {
    console.error("[superadmin/sales/agent-hotels/DELETE] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // Rimuovi il grant RevMan esplicito creato in fase di associazione, così la
  // struttura non resta accessibile dopo il detach.
  if (assoc?.sales_agent_id && assoc?.hotel_id) {
    try {
      const { data: agent } = await svc
        .from("sales_agents")
        .select("user_id")
        .eq("id", assoc.sales_agent_id)
        .maybeSingle()
      if (agent?.user_id) {
        await svc
          .from("revman_sales_access")
          .delete()
          .eq("hotel_id", assoc.hotel_id)
          .eq("sales_agent_id", agent.user_id)
      }
    } catch (e) {
      console.error("[superadmin/sales/agent-hotels/DELETE] revoke revman exception:", e)
    }
  }

  return NextResponse.json({ success: true })
}
