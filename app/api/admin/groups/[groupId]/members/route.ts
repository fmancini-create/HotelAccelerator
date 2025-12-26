import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    // Verify group belongs to property
    const { data: group } = await supabase
      .from("user_groups")
      .select("id")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) {
      return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })
    }

    const { data: members, error } = await supabase
      .from("user_group_members")
      .select(`
        id,
        user_id,
        admin_users!inner (
          id,
          name,
          email
        )
      `)
      .eq("group_id", groupId)

    if (error) throw error

    const formattedMembers = members?.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      user_name: (m.admin_users as any)?.name || "",
      user_email: (m.admin_users as any)?.email || "",
    }))

    return NextResponse.json({ members: formattedMembers || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json()

    const { user_id } = body

    // Verify group belongs to property
    const { data: group } = await supabase
      .from("user_groups")
      .select("id")
      .eq("id", groupId)
      .eq("property_id", propertyId)
      .single()

    if (!group) {
      return NextResponse.json({ error: "Gruppo non trovato" }, { status: 404 })
    }

    const { data: member, error } = await supabase
      .from("user_group_members")
      .insert({
        group_id: groupId,
        user_id,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ member })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
