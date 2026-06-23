import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { getDevBypass } from "@/lib/auth-property"
import { ChannelAssignmentService } from "@/lib/platform-services/channel-assignment.service"

export async function GET(request: NextRequest) {
  try {
    // DEV BYPASS: dati fittizi solo in sviluppo locale (regola centralizzata in getDevBypass).
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

    // Listing users is an administrative action: only tenant admins / super admins.
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { data: users, error } = await supabase
      .from("admin_users")
      .select(`
        id,
        email,
        name,
        role,
        signature,
        signature_html,
        is_tenant_admin,
        can_upload,
        can_delete,
        can_move,
        can_manage_users,
        created_at
      `)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if (error) throw error

    // Get group memberships for each user
    const { data: memberships } = await supabase
      .from("user_group_members")
      .select("user_id, group_id")
      .in("user_id", users?.map((u) => u.id) || [])

    const usersWithGroups = users?.map((user) => ({
      ...user,
      groups: memberships?.filter((m) => m.user_id === user.id).map((m) => m.group_id) || [],
    }))

    return NextResponse.json({ users: usersWithGroups || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Creating users is reserved to tenant admins / super admins.
    const caller = await requireTenantAdmin(request)
    const propertyId = caller.propertyId
    const supabase = createServiceClient()
    const body = await request.json()

    const { email, password, name, role, is_tenant_admin } = body

    // Privilege-escalation guard: only a platform super_admin can mint another
    // super_admin. A tenant admin can create users (incl. tenant admins) only
    // within their own tenant.
    if (role === "super_admin" && !caller.isSuperAdmin) {
      return NextResponse.json({ error: "Non puoi creare un super admin" }, { status: 403 })
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) throw authError

    // Create admin_users record. The PK has no DB default and is expected to
    // match the Supabase auth user id (1:1 relationship), so it must be set here.
    const { data: user, error } = await supabase
      .from("admin_users")
      .insert({
        id: authData.user.id,
        property_id: propertyId,
        email,
        name,
        role,
        is_tenant_admin: is_tenant_admin || false,
        can_upload: true,
        can_delete: role !== "editor",
        can_move: true,
        can_manage_users: role === "super_admin" || is_tenant_admin,
      })
      .select()
      .single()

    if (error) {
      // Roll back the just-created auth user so the email isn't left orphaned
      // (which would make a retry fail with "email already registered").
      await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {})
      throw error
    }

    // "Mail di default": if a mailbox with the same address as the user's login
    // email already exists for this tenant, auto-assign it to the new user (owner).
    // This is best-effort: a failure here must not block user creation.
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

    return NextResponse.json({ user })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
