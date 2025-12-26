import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json()

    const { email, password, name, role, is_tenant_admin } = body

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) throw authError

    // Create admin_users record
    const { data: user, error } = await supabase
      .from("admin_users")
      .insert({
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

    if (error) throw error

    return NextResponse.json({ user })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
