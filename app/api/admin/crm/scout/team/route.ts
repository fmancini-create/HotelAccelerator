import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { accessErrorStatus, adminUserIdPerDatabase, isAccessError } from "@/lib/auth/admin-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import {
  assertScoutAssignmentAllowed,
  listScoutAssignableUsers,
  recordScoutUsage,
  requireScoutAccess,
} from "@/lib/crm/scout-access"

const assignSchema = z.object({
  action: z.literal("assign"),
  prospectId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const access = await requireScoutAccess(request, propertyId)
    const db = createServiceClient()
    const assignees = access.canAssign ? await listScoutAssignableUsers(db, access) : []

    let query = db
      .from("crm_apollo_prospects")
      .select("id,full_name,job_title,organization_name,city,country,status,email,assigned_to_user_id,assigned_by_user_id,assigned_at,created_by,updated_at")
      .eq("property_id", propertyId)
      .neq("status", "dismissed")
      .order("updated_at", { ascending: false })
      .limit(250)

    if (!access.canAssign && access.userId) {
      query = query.eq("assigned_to_user_id", access.userId)
    }

    const { data: rawProspects, error: prospectsError } = await query
    if (prospectsError) throw prospectsError

    let prospects = rawProspects ?? []

    // A lead can manage unassigned prospects plus prospects assigned to members
    // of the groups they lead. Tenant admins can manage the whole tenant.
    if (access.canAssign && !access.isAdmin && !access.isSuperAdmin) {
      const manageable = new Set(assignees.map((user) => user.id))
      prospects = prospects.filter(
        (prospect: any) => !prospect.assigned_to_user_id || manageable.has(String(prospect.assigned_to_user_id)),
      )
    }

    const userIds = Array.from(
      new Set(
        prospects
          .flatMap((prospect: any) => [prospect.assigned_to_user_id, prospect.assigned_by_user_id, prospect.created_by])
          .filter(Boolean)
          .map(String),
      ),
    )
    const { data: identities, error: identitiesError } = userIds.length
      ? await db.from("admin_users").select("id,name,email").in("id", userIds)
      : { data: [], error: null }
    if (identitiesError) throw identitiesError
    const identityById = new Map((identities ?? []).map((row: any) => [String(row.id), row]))

    return NextResponse.json({
      access: {
        canAssign: access.canAssign,
        currentUserId: access.userId,
        isAdmin: access.isAdmin,
        isGroupLead: access.isGroupLead,
      },
      assignees,
      prospects: prospects.map((prospect: any) => {
        const assigned = prospect.assigned_to_user_id
          ? identityById.get(String(prospect.assigned_to_user_id)) as any
          : null
        const creator = prospect.created_by ? identityById.get(String(prospect.created_by)) as any : null
        return {
          ...prospect,
          assignee: assigned
            ? { id: String(assigned.id), name: assigned.name || assigned.email, email: assigned.email }
            : null,
          createdBy: creator
            ? { id: String(creator.id), name: creator.name || creator.email, email: creator.email }
            : null,
        }
      }),
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const status = isAccessError(error) ? accessErrorStatus(error) : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere le assegnazioni Scout." },
      { status },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const access = await requireScoutAccess(request, propertyId)
    const body = assignSchema.parse(await request.json())
    const db = createServiceClient()

    await assertScoutAssignmentAllowed(db, access, body.userId)

    const { data: prospect, error: prospectError } = await db
      .from("crm_apollo_prospects")
      .select("id,assigned_to_user_id")
      .eq("property_id", propertyId)
      .eq("id", body.prospectId)
      .neq("status", "dismissed")
      .maybeSingle()
    if (prospectError) throw prospectError
    if (!prospect) return NextResponse.json({ error: "Prospect non trovato nel tenant attivo." }, { status: 404 })

    // Group leads cannot take over a prospect assigned outside their own groups.
    if (!access.isAdmin && !access.isSuperAdmin && prospect.assigned_to_user_id) {
      const manageable = new Set((await listScoutAssignableUsers(db, access)).map((user) => user.id))
      if (!manageable.has(String(prospect.assigned_to_user_id))) {
        return NextResponse.json({ error: "Questo prospect è gestito da un altro gruppo." }, { status: 403 })
      }
    }

    const now = new Date().toISOString()
    const assignedBy = adminUserIdPerDatabase(access.userId)
    const { data, error } = await db
      .from("crm_apollo_prospects")
      .update({
        assigned_to_user_id: body.userId,
        assigned_by_user_id: body.userId ? assignedBy : null,
        assigned_at: body.userId ? now : null,
        updated_at: now,
      })
      .eq("property_id", propertyId)
      .eq("id", body.prospectId)
      .select("id,assigned_to_user_id,assigned_at")
      .single()
    if (error) throw error

    await recordScoutUsage(db, {
      propertyId,
      access,
      action: "assign",
      prospectId: body.prospectId,
      targetUserId: body.userId,
      metadata: { unassigned: body.userId === null },
    })

    return NextResponse.json({ prospect: data })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Assegnazione non valida.", details: error.flatten() }, { status: 400 })
    }
    const status = isAccessError(error) ? accessErrorStatus(error) : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assegnazione Scout non riuscita." },
      { status },
    )
  }
}
