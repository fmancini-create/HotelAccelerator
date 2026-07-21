import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/area-managers
 *
 * Helper per la UI dell'editor agente nel super-admin:
 *  - list: tutti gli agenti con is_area_manager=true (per popolare il
 *    dropdown "Capo area" quando si configura un agente diretto)
 *  - default_pct: il valore corrente di area_manager_default_pct in
 *    sales_system_settings (default 15 se mai impostato)
 */
export async function GET() {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const svc = await createServiceRoleClient()
  const [{ data: areaManagers }, { data: setting }] = await Promise.all([
    svc
      .from("sales_agents")
      .select("id, display_name, email, area_manager_override_pct, is_active")
      .eq("is_area_manager", true)
      .order("display_name", { ascending: true }),
    svc
      .from("sales_system_settings")
      .select("value_numeric")
      .eq("key", "area_manager_default_pct")
      .maybeSingle(),
  ])

  return NextResponse.json({
    default_pct: Number(setting?.value_numeric ?? 15),
    area_managers: areaManagers ?? [],
  })
}

/**
 * PATCH /api/superadmin/sales/area-managers
 *
 * Aggiorna il default sistema dell'aliquota override (area_manager_default_pct).
 * Body: { default_pct: number }
 */
export async function PATCH(req: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await req.json().catch(() => null)
  const pct = Number(body?.default_pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return NextResponse.json({ error: "invalid_pct" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()
  const { error } = await svc
    .from("sales_system_settings")
    .upsert({ key: "area_manager_default_pct", value_numeric: pct, updated_at: new Date().toISOString() })
  if (error) {
    console.error("[superadmin/area-managers/PATCH] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  return NextResponse.json({ default_pct: pct })
}
