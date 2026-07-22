import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * POST /api/superadmin/sales/agent-hotels
 *
 * Crea/aggiorna manualmente l'associazione (sales_agent_id, hotel_id) dal
 * superadmin. Idempotente via UNIQUE constraint. Usato per:
 *  - assegnare un hotel "orfano" (importato prima del CRM venditori) a un
 *    venditore;
 *  - correggere un'attribuzione sbagliata dopo una riassegnazione lead;
 *  - pre-attribuire un hotel a un venditore prima ancora che il lead
 *    completi l'onboarding.
 */
export async function POST(req: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body?.sales_agent_id || !body?.hotel_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()

  const payload = {
    sales_agent_id: body.sales_agent_id,
    hotel_id: body.hotel_id,
    commission_percentage: body.commission_percentage ?? null,
    commission_basis: body.commission_basis ?? "mrr",
    lead_status: body.lead_status ?? "configured",
    can_view_subscription: !!body.can_view_subscription,
    can_view_payments: !!body.can_view_payments,
    can_view_metrics: !!body.can_view_metrics,
    can_view_full_dashboard: !!body.can_view_full_dashboard,
    attached_via: body.attached_via ?? "manual_admin",
    activated_at: body.activated_at ?? new Date().toISOString(),
    notes: body.notes ?? null,
  }

  const { data, error } = await svc
    .from("sales_agent_hotels")
    .upsert(payload, { onConflict: "sales_agent_id,hotel_id" })
    .select()
    .single()

  if (error) {
    console.error("[superadmin/sales/agent-hotels/POST] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  // Crea anche il grant RevMan esplicito (sola lettura) per questo venditore.
  // sales_agent_hotels e revman_sales_access usano CHIAVI DIVERSE:
  //  - sales_agent_hotels.sales_agent_id  = sales_agents.id
  //  - revman_sales_access.sales_agent_id = profiles.id (auth user id)
  // Risolviamo l'user_id dall'agente e scriviamo il grant: cosi' il venditore
  // associato puo' SEMPRE aprire l'Area RevMan (note/attivita'/file), a
  // prescindere dalla logica grant-OR-associazione lato runtime. Best-effort:
  // un fallimento qui non deve bloccare l'associazione gia' creata.
  try {
    const { data: agent } = await svc
      .from("sales_agents")
      .select("user_id")
      .eq("id", body.sales_agent_id)
      .maybeSingle()
    if (agent?.user_id) {
      const { error: grantErr } = await svc
        .from("revman_sales_access")
        .upsert(
          { hotel_id: body.hotel_id, sales_agent_id: agent.user_id, granted_by: null },
          { onConflict: "hotel_id,sales_agent_id" },
        )
      if (grantErr) {
        console.error("[superadmin/sales/agent-hotels/POST] grant revman error:", grantErr)
      }
    }
  } catch (e) {
    console.error("[superadmin/sales/agent-hotels/POST] grant revman exception:", e)
  }

  return NextResponse.json({ association: data })
}
