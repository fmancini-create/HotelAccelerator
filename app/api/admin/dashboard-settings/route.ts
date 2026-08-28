import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, adminUserIdPerDatabase, requireTenantAdmin } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import {
  DASHBOARD_PANEL_IDS,
  parseDashboardGoals,
  readDashboardUserSettings,
  sanitizeHiddenPanels,
} from "@/lib/platform/dashboard-user-settings"

export const dynamic = "force-dynamic"

async function requireTenantUser(propertyId: string, userId: string) {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from("admin_users")
    .select("id, name, email, role")
    .eq("property_id", propertyId)
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw Object.assign(new Error("Utente non trovato nella struttura"), { status: 404 })
  return data
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const userId = request.nextUrl.searchParams.get("userId")
    if (!userId) return NextResponse.json({ error: "userId obbligatorio" }, { status: 400 })

    const user = await requireTenantUser(caller.propertyId, userId)
    const sb = createServiceClient()
    const settings = await readDashboardUserSettings(sb, caller.propertyId, userId)

    return NextResponse.json({ user, panels: DASHBOARD_PANEL_IDS, settings })
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : accessErrorStatus(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere le impostazioni dashboard" },
      { status },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const body = await request.json().catch(() => null)
    if (!body || typeof body.userId !== "string") {
      return NextResponse.json({ error: "userId obbligatorio" }, { status: 400 })
    }

    await requireTenantUser(caller.propertyId, body.userId)
    const hiddenPanels = sanitizeHiddenPanels(body.hiddenPanels)
    const goals = parseDashboardGoals(body.goals)
    const sb = createServiceClient()

    const { error } = await sb.from("dashboard_user_settings").upsert(
      {
        property_id: caller.propertyId,
        user_id: body.userId,
        hidden_panels: hiddenPanels,
        responses_target: goals.responsesTarget,
        conversations_target: goals.conversationsTarget,
        median_response_seconds_target: goals.medianResponseSecondsTarget,
        updated_by: adminUserIdPerDatabase(caller.adminUserId),
      },
      { onConflict: "property_id,user_id" },
    )
    if (error) throw error

    return NextResponse.json({
      userId: body.userId,
      settings: { hiddenPanels, goals },
    })
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : accessErrorStatus(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile salvare le impostazioni dashboard" },
      { status },
    )
  }
}
