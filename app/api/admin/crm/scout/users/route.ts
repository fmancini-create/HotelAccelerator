import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { accessErrorStatus, adminUserIdPerDatabase, requireTenantAdmin } from "@/lib/auth/admin-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { recordScoutUsage } from "@/lib/crm/scout-access"

const patchSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.boolean(),
})

export async function GET(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const db = createServiceClient()

    const { data: memberships, error: membershipError } = await db
      .from("tenant_user_memberships")
      .select("user_id, role, is_tenant_admin")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })
    if (membershipError) throw membershipError

    const rows = memberships ?? []
    const userIds = rows.map((row: any) => String(row.user_id)).filter(Boolean)
    if (!userIds.length) return NextResponse.json({ users: [] })

    const [{ data: identities, error: identitiesError }, { data: accessRows, error: accessError }, { data: groups, error: groupsError }] =
      await Promise.all([
        db.from("admin_users").select("id,name,email").in("id", userIds),
        db.from("crm_scout_user_access").select("user_id,enabled,updated_at").eq("property_id", propertyId),
        db.from("user_groups").select("id").eq("property_id", propertyId),
      ])
    if (identitiesError) throw identitiesError
    if (accessError) throw accessError
    if (groupsError) throw groupsError

    const groupIds = (groups ?? []).map((row: any) => String(row.id)).filter(Boolean)
    const { data: leadRows, error: leadError } = groupIds.length
      ? await db
          .from("user_group_members")
          .select("user_id")
          .eq("is_lead", true)
          .in("group_id", groupIds)
          .in("user_id", userIds)
      : { data: [], error: null }
    if (leadError) throw leadError

    const identityById = new Map((identities ?? []).map((row: any) => [String(row.id), row]))
    const accessById = new Map((accessRows ?? []).map((row: any) => [String(row.user_id), row]))
    const leads = new Set((leadRows ?? []).map((row: any) => String(row.user_id)))

    const users = rows
      .map((membership: any) => {
        const identity = identityById.get(String(membership.user_id)) as any
        if (!identity) return null
        const scout = accessById.get(String(membership.user_id)) as any
        return {
          id: String(identity.id),
          name: String(identity.name || identity.email || "Utente"),
          email: String(identity.email || ""),
          role: String(membership.role || "editor"),
          isTenantAdmin: membership.is_tenant_admin === true,
          isGroupLead: leads.has(String(identity.id)),
          scoutEnabled: scout?.enabled === true,
          scoutUpdatedAt: scout?.updated_at ?? null,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ users })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere le abilitazioni Scout." },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const body = patchSchema.parse(await request.json())
    const db = createServiceClient()

    const { data: membership, error: membershipError } = await db
      .from("tenant_user_memberships")
      .select("user_id")
      .eq("property_id", propertyId)
      .eq("user_id", body.userId)
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership) return NextResponse.json({ error: "Utente non appartenente al tenant attivo." }, { status: 404 })

    const updatedBy = adminUserIdPerDatabase(caller.adminUserId)
    const now = new Date().toISOString()
    const { data, error } = await db
      .from("crm_scout_user_access")
      .upsert(
        {
          property_id: propertyId,
          user_id: body.userId,
          enabled: body.enabled,
          updated_by: updatedBy,
          updated_at: now,
        },
        { onConflict: "property_id,user_id" },
      )
      .select("user_id,enabled,updated_at")
      .single()
    if (error) throw error

    await recordScoutUsage(db, {
      propertyId,
      access: { userId: updatedBy, label: caller.fullName || caller.email },
      action: "access_change",
      targetUserId: body.userId,
      metadata: { enabled: body.enabled },
    })

    return NextResponse.json({
      userId: data.user_id,
      scoutEnabled: data.enabled === true,
      scoutUpdatedAt: data.updated_at,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Richiesta non valida.", details: error.flatten() }, { status: 400 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aggiornamento Scout non riuscito." },
      { status: accessErrorStatus(error) },
    )
  }
}
