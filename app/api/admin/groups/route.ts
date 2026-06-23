import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { getDevBypass } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    // DEV BYPASS: dati fittizi solo in sviluppo locale (regola centralizzata in getDevBypass).
    if (await getDevBypass(request)) {
      return NextResponse.json({
        groups: [
          {
            id: "dev-group-1",
            name: "Dev Group",
            description: "Development group",
            color: "#3b82f6",
            created_at: new Date().toISOString(),
            members: [],
          },
        ],
      })
    }

    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()

    const { data: groups, error } = await supabase
      .from("user_groups")
      .select(`
        id,
        name,
        description,
        color,
        created_at
      `)
      .eq("property_id", propertyId)
      .order("name", { ascending: true })

    if (error) throw error

    // Get member counts
    const { data: memberCounts } = await supabase
      .from("user_group_members")
      .select("group_id")
      .in("group_id", groups?.map((g) => g.id) || [])

    const groupsWithCounts = groups?.map((group) => ({
      ...group,
      members: memberCounts?.filter((m) => m.group_id === group.id).map((m) => m.group_id) || [],
    }))

    return NextResponse.json({ groups: groupsWithCounts || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const body = await request.json()

    const { name, description, color } = body

    const { data: group, error } = await supabase
      .from("user_groups")
      .insert({
        property_id: propertyId,
        name,
        description,
        color: color || "#6b7280",
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ group })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: accessErrorStatus(error) })
  }
}
