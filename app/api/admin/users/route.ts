import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { getDevBypass } from "@/lib/auth-property"
import { ChannelAssignmentService } from "@/lib/platform-services/channel-assignment.service"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

type KpiSetting = {
  user_id: string
  enabled: boolean
  tracking_started_at: string | null
}

type TenantMembership = {
  user_id: string
  role: string
  is_tenant_admin: boolean
  can_upload: boolean
  can_delete: boolean
  can_move: boolean
  can_manage_users: boolean
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    if (await getDevBypass(request)) {
      return NextResponse.json({
        users: [
          {
            id: "dev-user-1",
            email: "dev@hotelaccelerator.local",
            name: "Dev Admin",
            role: "admin",
            signature: null,
            signature_html: null,
            is_tenant_admin: true,
            can_upload: true,
            can_delete: true,
            can_move: true,
            can_manage_users: true,
            created_at: new Date().toISOString(),
            groups: [],
          },
        ],
      })
    }

    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    // La membership tenant è la fonte autorevole. admin_users contiene
    // l'identità/auth e il tenant primario legacy, ma una persona può lavorare
    // in più tenant senza duplicare l'account Supabase Auth.
    const { data: memberships, error: membershipsError } = await supabase
      .from("tenant_user_memberships")
      .select("user_id, role, is_tenant_admin, can_upload, can_delete, can_move, can_manage_users, created_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })
    if (membershipsError) throw membershipsError

    const membershipRows = (memberships || []) as TenantMembership[]
    const userIds = membershipRows.map((m) => m.user_id)
    const { data: identities, error: identitiesError } = userIds.length
      ? await supabase
          .from("admin_users")
          .select("id, email, name, signature, signature_html")
          .in("id", userIds)
      : { data: [], error: null }
    if (identitiesError) throw identitiesError

    const identityById = new Map((identities || []).map((u: any) => [String(u.id), u]))
    const users = membershipRows
      .map((membership) => {
        const identity = identityById.get(membership.user_id) as any | undefined
        if (!identity) return null
        return {
          id: identity.id,
          email: identity.email,
          name: identity.name,
          signature: identity.signature,
          signature_html: identity.signature_html,
          role: membership.role,
          is_tenant_admin: membership.is_tenant_admin,
          can_upload: membership.can_upload,
          can_delete: membership.can_delete,
          can_move: membership.can_move,
          can_manage_users: membership.can_manage_users,
          created_at: membership.created_at,
        }
      })
      .filter(Boolean) as Array<any>

    const [{ data: groupMemberships, error: groupMembershipsError }, { data: kpiSettings, error: kpiError }] =
      await Promise.all([
        userIds.length
          ? supabase.from("user_group_members").select("user_id, group_id").in("user_id", userIds)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("operator_kpi_settings")
          .select("user_id, enabled, tracking_started_at")
          .eq("property_id", propertyId),
      ])

    if (groupMembershipsError) throw groupMembershipsError
    if (kpiError) throw kpiError

    const kpiByUser = new Map<string, KpiSetting>(
      ((kpiSettings || []) as KpiSetting[]).map((setting) => [setting.user_id, setting]),
    )

    const usersWithGroups = users.map((user) => ({
      ...user,
      groups:
        groupMemberships
          ?.filter((m: { user_id: string; group_id: string }) => m.user_id === user.id)
          .map((m: { user_id: string; group_id: string }) => m.group_id) || [],
      kpi_enabled: kpiByUser.get(user.id)?.enabled === true,
      kpi_tracking_started_at: kpiByUser.get(user.id)?.tracking_started_at ?? null,
    }))

    return NextResponse.json({ users: usersWithGroups })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const supabase = createServiceClient()
    const body = await request.json()

    const { email, password, name, role, is_tenant_admin } = body

    if (role === "super_admin" && !caller.isSuperAdmin) {
      return NextResponse.json({ error: "Non puoi creare un super admin" }, { status: 403 })
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) throw authError

    const tenantRole = role === "admin" ? "admin" : "editor"
    const tenantAdmin = is_tenant_admin === true

    const { data: user, error } = await supabase
      .from("admin_users")
      .insert({
        id: authData.user.id,
        property_id: propertyId,
        email,
        name,
        role: tenantRole,
        is_tenant_admin: tenantAdmin,
        can_upload: true,
        can_delete: tenantRole !== "editor",
        can_move: true,
        can_manage_users: tenantAdmin,
      })
      .select()
      .single()

    if (error) {
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {})
      throw error
    }

    const { error: membershipError } = await supabase.from("tenant_user_memberships").insert({
      property_id: propertyId,
      user_id: user.id,
      role: tenantRole,
      is_tenant_admin: tenantAdmin,
      can_upload: true,
      can_delete: tenantRole !== "editor",
      can_move: true,
      can_manage_users: tenantAdmin,
    })
    if (membershipError) {
      await supabase.from("admin_users").delete().eq("id", user.id)
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {})
      throw membershipError
    }

    try {
      const { data: ownMailbox } = await supabase
        .from("email_channels")
        .select("id")
        .eq("property_id", propertyId)
        .ilike("email_address", email)
        .maybeSingle()

      if (ownMailbox?.id) {
        const assignments = new ChannelAssignmentService(supabase)
        await assignments.addAssignment(propertyId, "email", ownMailbox.id, user.id, "owner")
      }
    } catch (assignErr) {
      console.error("[v0] Auto-assign default mailbox failed:", assignErr)
    }

    return NextResponse.json({ user: { ...user, role: tenantRole, is_tenant_admin: tenantAdmin } })
  } catch (error: any) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
