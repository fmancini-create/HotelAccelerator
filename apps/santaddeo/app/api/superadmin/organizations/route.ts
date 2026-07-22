import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// GET - List all organizations (superadmin only)
export async function GET() {
  try {
    const isV0Preview = await isDevAuthAsync()
    const supabase = await createServiceRoleClient()
    
    if (!isV0Preview) {
      const authClient = await createClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const { data, error } = await supabase.from("organizations").select("id, name").order("name")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error("Error in organizations GET route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create new organization
export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createServiceRoleClient()

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Il nome e obbligatorio" }, { status: 400 })
    }

    const { data: organization, error } = await supabase
      .from("organizations")
      .insert({
        name: body.name.trim(),
        type: body.type || "hotel",
        company_name: body.company_name?.trim() || null,
        vat_number: body.vat_number?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating organization:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, organization })
  } catch (error) {
    console.error("Error in organizations POST route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
