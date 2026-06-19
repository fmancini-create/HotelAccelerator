/**
 * GET /api/platform/me
 *
 * Returns the authenticated user's platform-level identity:
 *  - role: "super_admin" | "tenant_admin" | "none"
 *  - email, name
 *  - tenants: properties the user is allowed to operate on
 *      - super_admin: all active properties
 *      - tenant_admin: only the property tied to their admin_users row
 *  - activePropertyId: currently selected active tenant (cookie) if any
 *
 * Used by the TenantSwitcher UI and hooks to drive cross-tenant navigation.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ACTIVE_PROPERTY_COOKIE, isValidUuid } from "@/lib/platform-context"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return NextResponse.json({ role: "none", tenants: [], activePropertyId: null }, { status: 401 })
  }

  // 1. Check platform-level role first.
  const { data: collaborator } = await supabase
    .from("platform_collaborators")
    .select("role, name, is_active")
    .eq("email", user.email)
    .maybeSingle()

  const isSuperAdmin = collaborator?.role === "super_admin" && collaborator?.is_active

  // 2. Read active-property cookie (if any) - used for super_admin switching.
  const cookieHeader = request.headers.get("cookie") || ""
  const cookieMatch = cookieHeader.match(new RegExp(`(?:^|; )${ACTIVE_PROPERTY_COOKIE}=([^;]+)`))
  const cookieValue = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null
  let activePropertyId: string | null = isValidUuid(cookieValue) ? cookieValue : null

  // 3. Build tenant list based on role.
  let tenants: Array<{ id: string; name: string; subdomain: string | null }> = []

  if (isSuperAdmin) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, subdomain")
      .order("name", { ascending: true })
    tenants = properties || []
    // If no active cookie but tenants exist, default to the first one for convenience.
    if (!activePropertyId && tenants.length > 0) {
      activePropertyId = tenants[0].id
    }

    return NextResponse.json({
      role: "super_admin",
      isAdmin: true,
      isTenantAdmin: true,
      canManageUsers: true,
      memberRole: "super_admin",
      email: user.email,
      name: collaborator?.name || user.email.split("@")[0],
      tenants,
      activePropertyId,
    })
  }

  // Tenant member path. NOTE: a row in admin_users only means the user belongs
  // to a tenant — it does NOT, by itself, grant admin powers. Administrative
  // access (role "tenant_admin") requires the is_tenant_admin flag.
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("property_id, name, role, is_tenant_admin, can_manage_users")
    .eq("email", user.email)
    .maybeSingle()

  if (adminUser?.property_id) {
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, subdomain")
      .eq("id", adminUser.property_id)
      .maybeSingle()

    if (property) {
      tenants = [property]
      activePropertyId = property.id
    }
  }

  const isTenantAdmin = adminUser?.is_tenant_admin === true

  return NextResponse.json({
    // "tenant_admin" only for real admins; other members get "member".
    role: !adminUser ? "none" : isTenantAdmin ? "tenant_admin" : "member",
    isAdmin: isTenantAdmin,
    isTenantAdmin,
    canManageUsers: adminUser?.can_manage_users === true,
    memberRole: adminUser?.role ?? null,
    email: user.email,
    name: adminUser?.name || user.email.split("@")[0],
    tenants,
    activePropertyId,
  })
}
