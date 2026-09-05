import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/server"
import { AccessError, adminUserIdPerDatabase, getCallerIdentity } from "@/lib/auth/admin-access"
import { isGroupLead } from "@/lib/auth/group-lead"
import { economicsForScoutUsage } from "@/lib/crm/scout-billing"

export type ScoutAccessContext = {
  propertyId: string
  userId: string | null
  label: string
  enabled: boolean
  canAssign: boolean
  isAdmin: boolean
  isGroupLead: boolean
  isSuperAdmin: boolean
}

export type ScoutAssignableUser = {
  id: string
  name: string
  email: string
  role: string
  isTenantAdmin: boolean
}

export async function resolveScoutAccess(request: NextRequest, propertyId: string): Promise<ScoutAccessContext> {
  const identity = await getCallerIdentity(request)
  if (!identity) throw new AccessError("Non autenticato", 401)
  if (!propertyId) throw new AccessError("Nessun tenant selezionato", 400)

  if (identity.isSuperAdmin) {
    return {
      propertyId,
      userId: null,
      label: identity.fullName || identity.email,
      enabled: true,
      canAssign: true,
      isAdmin: true,
      isGroupLead: false,
      isSuperAdmin: true,
    }
  }

  const userId = adminUserIdPerDatabase(identity.adminUserId)
  if (!userId) throw new AccessError("Profilo operatore non disponibile nel tenant", 403)

  const db = createServiceClient()
  const { data: membership, error: membershipError } = await db
    .from("tenant_user_memberships")
    .select("is_tenant_admin")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) throw new AccessError("Non appartieni al tenant attivo", 403)

  const [{ data: permission, error: permissionError }, lead] = await Promise.all([
    db.from("crm_scout_user_access").select("enabled").eq("property_id", propertyId).eq("user_id", userId).maybeSingle(),
    isGroupLead(propertyId, userId),
  ])
  if (permissionError) throw permissionError

  const enabled = permission?.enabled === true
  const isAdmin = membership.is_tenant_admin === true
  return {
    propertyId,
    userId,
    label: identity.fullName || identity.email,
    enabled,
    canAssign: enabled && (isAdmin || lead),
    isAdmin,
    isGroupLead: lead,
    isSuperAdmin: false,
  }
}

export async function requireScoutAccess(request: NextRequest, propertyId: string) {
  const access = await resolveScoutAccess(request, propertyId)
  if (!access.enabled) {
    throw new AccessError("Scout non è abilitato per il tuo utente. Chiedi all'amministratore del tenant di attivarlo.", 403)
  }
  return access
}

async function ledGroupMemberIds(db: SupabaseClient, propertyId: string, userId: string): Promise<string[]> {
  const { data: groups, error: groupsError } = await db.from("user_groups").select("id").eq("property_id", propertyId)
  if (groupsError) throw groupsError
  const groupIds = (groups ?? []).map((row: any) => String(row.id)).filter(Boolean)
  if (!groupIds.length) return [userId]

  const { data: leads, error: leadError } = await db
    .from("user_group_members")
    .select("group_id")
    .eq("user_id", userId)
    .eq("is_lead", true)
    .in("group_id", groupIds)
  if (leadError) throw leadError
  const ledIds = (leads ?? []).map((row: any) => String(row.group_id)).filter(Boolean)
  if (!ledIds.length) return [userId]

  const { data: members, error: membersError } = await db.from("user_group_members").select("user_id").in("group_id", ledIds)
  if (membersError) throw membersError
  return Array.from(new Set([userId, ...(members ?? []).map((row: any) => String(row.user_id)).filter(Boolean)]))
}

export async function listScoutAssignableUsers(db: SupabaseClient, access: ScoutAccessContext): Promise<ScoutAssignableUser[]> {
  const { data: memberships, error: membershipError } = await db
    .from("tenant_user_memberships")
    .select("user_id, role, is_tenant_admin")
    .eq("property_id", access.propertyId)
  if (membershipError) throw membershipError

  const rows = memberships ?? []
  const tenantIds = rows.map((row: any) => String(row.user_id)).filter(Boolean)
  let allowed = tenantIds
  if (!access.isAdmin && !access.isSuperAdmin) {
    if (!access.userId) return []
    const leadMembers = new Set(await ledGroupMemberIds(db, access.propertyId, access.userId))
    allowed = tenantIds.filter((id) => leadMembers.has(id))
  }
  if (!allowed.length) return []

  const { data: users, error: usersError } = await db.from("admin_users").select("id, name, email").in("id", allowed)
  if (usersError) throw usersError
  const membershipByUser = new Map(rows.map((row: any) => [String(row.user_id), row]))

  return (users ?? []).map((user: any) => {
    const membership = membershipByUser.get(String(user.id)) as any
    return {
      id: String(user.id),
      name: String(user.name || user.email || "Utente"),
      email: String(user.email || ""),
      role: String(membership?.role || "editor"),
      isTenantAdmin: membership?.is_tenant_admin === true,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, "it"))
}

export async function assertScoutAssignmentAllowed(db: SupabaseClient, access: ScoutAccessContext, targetUserId: string | null) {
  if (!access.canAssign) throw new AccessError("Non hai il permesso di assegnare prospect Scout", 403)
  if (!targetUserId) return
  const allowed = await listScoutAssignableUsers(db, access)
  if (!allowed.some((user) => user.id === targetUserId)) {
    throw new AccessError("Puoi assegnare prospect solo agli utenti che puoi gestire", 403)
  }
}

export async function recordScoutUsage(db: SupabaseClient, input: {
  propertyId: string
  access: Pick<ScoutAccessContext, "userId" | "label">
  action: "search" | "save" | "enrich" | "import" | "dismiss" | "assign" | "access_change"
  success?: boolean
  creditsUsed?: number
  prospectId?: string | null
  targetUserId?: string | null
  errorMessage?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    const creditsUsed = Number.isFinite(input.creditsUsed) ? Math.max(0, Number(input.creditsUsed)) : 0
    const economics = creditsUsed > 0 && input.success !== false
      ? await economicsForScoutUsage(db, creditsUsed).catch((error) => {
          console.error("[scout] cost attribution failed", error)
          return null
        })
      : null

    const { error } = await db.from("crm_scout_usage_events").insert({
      property_id: input.propertyId,
      user_id: adminUserIdPerDatabase(input.access.userId),
      actor_label: input.access.label || null,
      action: input.action,
      success: input.success !== false,
      credits_used: Number(creditsUsed.toFixed(4)),
      provider_unit_cost_micros: economics?.unitCostMicros ?? null,
      provider_cost_micros: economics?.providerCostMicros ?? null,
      price_multiplier: economics?.multiplier ?? null,
      customer_value_micros: economics?.customerValueMicros ?? null,
      prospect_id: input.prospectId || null,
      target_user_id: adminUserIdPerDatabase(input.targetUserId),
      error_message: input.errorMessage?.slice(0, 1000) || null,
      metadata: {
        ...(input.metadata ?? {}),
        ...(economics ? { billing_currency: economics.currency } : {}),
      },
    })
    if (error) console.error("[scout] usage audit failed", error)
  } catch (error) {
    console.error("[scout] usage audit exception", error)
  }
}
