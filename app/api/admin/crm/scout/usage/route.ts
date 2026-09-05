import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"

function monthStartIso() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const db = createServiceClient()
    const since = monthStartIso()

    const [membershipsResult, accessResult, eventsResult, prospectsResult] = await Promise.all([
      db
        .from("tenant_user_memberships")
        .select("user_id,role,is_tenant_admin")
        .eq("property_id", propertyId),
      db
        .from("crm_scout_user_access")
        .select("user_id,enabled,updated_at")
        .eq("property_id", propertyId),
      db
        .from("crm_scout_usage_events")
        .select("user_id,actor_label,action,success,credits_used,created_at")
        .eq("property_id", propertyId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      db
        .from("crm_apollo_prospects")
        .select("assigned_to_user_id,status")
        .eq("property_id", propertyId)
        .neq("status", "dismissed"),
    ])

    if (membershipsResult.error) throw membershipsResult.error
    if (accessResult.error) throw accessResult.error
    if (eventsResult.error) throw eventsResult.error
    if (prospectsResult.error) throw prospectsResult.error

    const memberships = membershipsResult.data ?? []
    const userIds = memberships.map((row: any) => String(row.user_id)).filter(Boolean)
    const { data: identities, error: identitiesError } = userIds.length
      ? await db.from("admin_users").select("id,name,email").in("id", userIds)
      : { data: [], error: null }
    if (identitiesError) throw identitiesError

    const identityById = new Map((identities ?? []).map((row: any) => [String(row.id), row]))
    const accessById = new Map((accessResult.data ?? []).map((row: any) => [String(row.user_id), row]))
    const events = eventsResult.data ?? []
    const prospects = prospectsResult.data ?? []

    const rows = memberships.map((membership: any) => {
      const id = String(membership.user_id)
      const identity = identityById.get(id) as any
      const ownEvents = events.filter((event: any) => String(event.user_id || "") === id)
      const count = (action: string) => ownEvents.filter((event: any) => event.action === action && event.success !== false).length
      const scout = accessById.get(id) as any
      const last = ownEvents[0] as any

      return {
        userId: id,
        name: String(identity?.name || identity?.email || "Utente"),
        email: String(identity?.email || ""),
        role: String(membership.role || "editor"),
        isTenantAdmin: membership.is_tenant_admin === true,
        enabled: scout?.enabled === true,
        searches: count("search"),
        saved: count("save"),
        enriched: count("enrich"),
        imported: count("import"),
        assignments: count("assign"),
        dismissed: count("dismiss"),
        failed: ownEvents.filter((event: any) => event.success === false).length,
        creditsUsed: ownEvents.reduce((sum: number, event: any) => sum + Number(event.credits_used || 0), 0),
        assignedProspects: prospects.filter((prospect: any) => String(prospect.assigned_to_user_id || "") === id).length,
        lastUsedAt: last?.created_at ?? null,
      }
    })

    // Platform super-admins have no admin_users row. Keep their usage visible
    // instead of silently losing it from the tenant report.
    const systemEvents = events.filter((event: any) => !event.user_id)
    const platformRows = Array.from(new Set(systemEvents.map((event: any) => String(event.actor_label || "Amministratore piattaforma"))))
      .map((label) => {
        const ownEvents = systemEvents.filter((event: any) => String(event.actor_label || "Amministratore piattaforma") === label)
        const count = (action: string) => ownEvents.filter((event: any) => event.action === action && event.success !== false).length
        return {
          userId: null,
          name: label,
          email: "",
          role: "super_admin",
          isTenantAdmin: true,
          enabled: true,
          searches: count("search"),
          saved: count("save"),
          enriched: count("enrich"),
          imported: count("import"),
          assignments: count("assign"),
          dismissed: count("dismiss"),
          failed: ownEvents.filter((event: any) => event.success === false).length,
          creditsUsed: ownEvents.reduce((sum: number, event: any) => sum + Number(event.credits_used || 0), 0),
          assignedProspects: 0,
          lastUsedAt: ownEvents[0]?.created_at ?? null,
        }
      })

    const users = [...rows, ...platformRows].sort((a, b) => {
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
      return bTime - aTime || a.name.localeCompare(b.name, "it")
    })

    return NextResponse.json({
      period: { from: since, to: new Date().toISOString() },
      users,
      totals: {
        enabledUsers: rows.filter((row) => row.enabled).length,
        searches: users.reduce((sum, row) => sum + row.searches, 0),
        saved: users.reduce((sum, row) => sum + row.saved, 0),
        enriched: users.reduce((sum, row) => sum + row.enriched, 0),
        imported: users.reduce((sum, row) => sum + row.imported, 0),
        creditsUsed: users.reduce((sum, row) => sum + row.creditsUsed, 0),
        assignedProspects: prospects.filter((prospect: any) => prospect.assigned_to_user_id).length,
      },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere l'utilizzo Scout." },
      { status: accessErrorStatus(error) },
    )
  }
}
