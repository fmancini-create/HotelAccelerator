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
import { getMemberEffectiveAreas } from "@/lib/auth/area-access"
import { BASELINE_AREA_KEYS } from "@/lib/platform/areas"
import { normalizeTenantType, type TenantType } from "@/lib/platform/tenant-type"

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
  //    `type` distingue le strutture ricettive dai tenant azienda/agenzia:
  //    guida le etichette del selettore e nasconde le funzioni alberghiere.
  let tenants: Array<{ id: string; name: string; subdomain: string | null; type: TenantType }> = []

  if (isSuperAdmin) {
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, subdomain, type")
      .order("name", { ascending: true })
    tenants = (properties || []).map((p) => ({ ...p, type: normalizeTenantType(p.type) }))
    // Non inventare un tenant attivo quando manca il cookie: il selettore
    // mostrerebbe una struttura che le API non possono usare. L'utente deve
    // scegliere esplicitamente, cosi' POST /switch-tenant salva il contesto.

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
      // Tipo del tenant attivo: la UI lo usa per nascondere le funzioni
      // alberghiere quando si opera su un tenant azienda/agenzia.
      activeTenantType: tenants.find((t) => t.id === activePropertyId)?.type ?? "hotel",
      // Admins have access to every area; empty list signals "no filtering".
      areas: [],
    })
  }

  // Tenant member path. NOTE: a row in admin_users only means the user belongs
  // to a tenant — it does NOT, by itself, grant admin powers. Administrative
  // access (role "tenant_admin") requires the is_tenant_admin flag.
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, property_id, name, role, is_tenant_admin, can_manage_users")
    .eq("email", user.email)
    .maybeSingle()

  if (adminUser?.property_id) {
    const { data: property } = await supabase
      .from("properties")
      .select("id, name, subdomain, type")
      .eq("id", adminUser.property_id)
      .maybeSingle()

    if (property) {
      tenants = [{ ...property, type: normalizeTenantType(property.type) }]
      activePropertyId = property.id
    }
  }

  const isTenantAdmin = adminUser?.is_tenant_admin === true

  // Effective areas drive nav filtering for regular members. Admins are not
  // filtered (empty list). Members get baseline + granted areas (direct/group).
  let areas: string[] = []
  if (adminUser && !isTenantAdmin) {
    areas = adminUser.property_id
      ? await getMemberEffectiveAreas(adminUser.property_id, adminUser.id)
      : [...BASELINE_AREA_KEYS]
  }

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
    activeTenantType: tenants.find((t) => t.id === activePropertyId)?.type ?? "hotel",
    areas,
  })
}
