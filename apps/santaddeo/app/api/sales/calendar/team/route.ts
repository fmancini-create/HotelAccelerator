import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { resolveCalendarViewer } from "@/lib/sales/calendar-scope"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/calendar/team
 * Lista LEGGERA (id + nome) dei venditori di cui il chiamante può ispezionare
 * il calendario, per popolare il selettore in /sales/calendar:
 *  - capo area  -> i membri del proprio team (parent_agent_id === suo id)
 *  - super_admin -> tutti gli agenti attivi
 *  - venditore semplice -> nessuno (selettore non mostrato)
 *
 * Ritorna { can_view_team: boolean, self_agent_id: string|null, team: [...] }.
 */
export async function GET() {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()
  const viewer = await resolveCalendarViewer(svc, user.id)

  if (viewer.isSuperAdmin) {
    const { data } = await svc
      .from("sales_agents")
      .select("id, display_name, email")
      .eq("is_active", true)
      .order("display_name", { ascending: true })
    return NextResponse.json({
      can_view_team: true,
      self_agent_id: viewer.agentId,
      team: data ?? [],
    })
  }

  if (viewer.isAreaManager && viewer.agentId) {
    const { data } = await svc
      .from("sales_agents")
      .select("id, display_name, email")
      .eq("parent_agent_id", viewer.agentId)
      .eq("is_active", true)
      .order("display_name", { ascending: true })
    return NextResponse.json({
      can_view_team: true,
      self_agent_id: viewer.agentId,
      team: data ?? [],
    })
  }

  return NextResponse.json({ can_view_team: false, self_agent_id: viewer.agentId, team: [] })
}
