import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, adminUserIdPerDatabase, requireTenantAdmin } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const caller = await requireTenantAdmin(request)
    const { userId } = await params
    const body = await request.json().catch(() => null)

    if (!body || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Il campo enabled deve essere booleano" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const [{ data: user, error: userError }, { data: current, error: currentError }] = await Promise.all([
      supabase
        .from("admin_users")
        .select("id")
        .eq("property_id", caller.propertyId)
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("operator_kpi_settings")
        .select("enabled, tracking_started_at")
        .eq("property_id", caller.propertyId)
        .eq("user_id", userId)
        .maybeSingle(),
    ])

    if (userError) throw userError
    if (currentError) throw currentError
    if (!user) return NextResponse.json({ error: "Utente non trovato nella struttura" }, { status: 404 })

    const now = new Date().toISOString()
    const trackingStartedAt = body.enabled
      ? current?.enabled && current.tracking_started_at
        ? current.tracking_started_at
        : now
      : null
    const { data: setting, error } = await supabase
      .from("operator_kpi_settings")
      .upsert(
        {
          property_id: caller.propertyId,
          user_id: userId,
          enabled: body.enabled,
          tracking_started_at: trackingStartedAt,
          updated_by: adminUserIdPerDatabase(caller.adminUserId),
        },
        { onConflict: "property_id,user_id" },
      )
      .select("enabled, tracking_started_at")
      .single()

    if (error) throw error

    return NextResponse.json({
      userId,
      kpi_enabled: setting.enabled,
      kpi_tracking_started_at: setting.tracking_started_at,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const status = accessErrorStatus(error)
    const message = error instanceof Error && status !== 500 ? error.message : "Impossibile aggiornare i KPI"
    return NextResponse.json({ error: message }, { status })
  }
}
