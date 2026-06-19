import type { NextRequest } from "next/server"
import { createClient, createClientWithToken } from "@/lib/supabase/server"
import { getDevBypass, getTokenFromRequest } from "@/lib/auth-property"
import { readActivePropertyOverride } from "@/lib/platform-context"

/**
 * Role/authorization enforcement for the admin area.
 *
 * IMPORTANT: a row in `admin_users` only means the user belongs to a tenant —
 * it does NOT, by itself, grant administrative powers. Administrative access
 * (managing users, settings, modules, channels) is reserved to:
 *   - platform super_admins (platform_collaborators.role = 'super_admin')
 *   - tenant admins (admin_users.is_tenant_admin = true)
 *
 * The free-text `admin_users.role` value ("admin"/"editor") is informational
 * and is NOT used to grant access on its own — only the `is_tenant_admin`
 * flag (and super_admin) does. This prevents privilege escalation where any
 * authenticated tenant member could reach admin-only functionality.
 */

export interface CallerIdentity {
  userId: string
  adminUserId: string | null
  email: string
  propertyId: string | null
  role: string | null
  isSuperAdmin: boolean
  isTenantAdmin: boolean
  canManageUsers: boolean
}

// Tenant used by the dev/preview bypass (matches lib/auth-property.ts).
const DEV_PROPERTY_ID = "c16ad260-2c34-4544-9909-5cd444773986"

export class AccessError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "AccessError"
    this.status = status
  }
}

/**
 * Resolves the caller's full identity (role + tenant + capabilities).
 * Returns null when the request is not authenticated / not a known user.
 */
export async function getCallerIdentity(request?: NextRequest): Promise<CallerIdentity | null> {
  if (await getDevBypass(request)) {
    return {
      userId: "dev-user-id",
      adminUserId: "dev-admin-id",
      email: "dev@hotelaccelerator.local",
      propertyId: DEV_PROPERTY_ID,
      role: "admin",
      isSuperAdmin: true,
      isTenantAdmin: true,
      canManageUsers: true,
    }
  }

  const token = request ? await getTokenFromRequest(request) : undefined
  const supabase = token ? await createClientWithToken(token) : await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null

  // 1. Platform super_admin takes precedence (cross-tenant).
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, is_active")
    .eq("email", user.email)
    .maybeSingle()

  if (collaborator?.role === "super_admin" && collaborator.is_active) {
    const override = readActivePropertyOverride(request)
    return {
      userId: user.id,
      adminUserId: null,
      email: user.email,
      propertyId: override ?? null,
      role: "super_admin",
      isSuperAdmin: true,
      isTenantAdmin: true,
      canManageUsers: true,
    }
  }

  // 2. Tenant member (admin or not).
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, property_id, role, is_tenant_admin, can_manage_users")
    .eq("email", user.email)
    .maybeSingle()

  if (!adminUser) return null

  return {
    userId: user.id,
    adminUserId: adminUser.id,
    email: user.email,
    propertyId: adminUser.property_id,
    role: adminUser.role,
    isSuperAdmin: false,
    isTenantAdmin: adminUser.is_tenant_admin === true,
    canManageUsers: adminUser.can_manage_users === true,
  }
}

/**
 * Requires the caller to be an administrator (super_admin OR tenant admin).
 * Throws AccessError otherwise. Guarantees a non-null propertyId on return.
 */
export async function requireTenantAdmin(request?: NextRequest): Promise<CallerIdentity & { propertyId: string }> {
  const identity = await getCallerIdentity(request)
  if (!identity) throw new AccessError("Non autenticato", 401)
  if (!identity.isSuperAdmin && !identity.isTenantAdmin) {
    throw new AccessError("Accesso negato: sono richiesti privilegi di amministratore", 403)
  }
  if (!identity.propertyId) {
    throw new AccessError("Nessun tenant selezionato", 400)
  }
  return identity as CallerIdentity & { propertyId: string }
}

/**
 * Maps a thrown AccessError (or generic error) to an HTTP status code.
 * Use in API catch blocks so unauthorized access returns 401/403, not 500.
 */
export function accessErrorStatus(error: unknown): number {
  if (error instanceof AccessError) return error.status
  const message = error instanceof Error ? error.message : ""
  if (message.includes("Non autenticato")) return 401
  if (message.includes("Accesso negato")) return 403
  return 500
}
