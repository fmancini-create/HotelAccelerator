import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { isV0Preview } from "@/lib/v0-preview"

// V0 Demo user for dev environment
const V0_DEMO_USER = {
  id: "dev-user-id",
  email: "dev@santaddeo.com",
  role: "super_admin" as const,
}

export async function GET() {
  try {
    const isPreview = await isV0Preview()
    
    // Use service role client to bypass RLS for superadmin operations
    const supabase = await createServiceRoleClient()

    let userRole: string | null = null

    if (isPreview) {
      console.log("[v0] DEV MODE - Auth bypass enabled for pms-providers GET")
      userRole = V0_DEMO_USER.role
    } else {
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      userRole = profile?.role || null
    }

    // Verifica ruolo superadmin
    if (!userRole || !["superadmin", "super_admin"].includes(userRole)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    // Recupera tutti i PMS providers
    const { data: providers, error } = await supabase.from("pms_providers").select("*").order("name")

    if (error) {
      console.error("Error fetching PMS providers:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ providers: providers || [] })
  } catch (error) {
    console.error("Error in GET /api/superadmin/connectors/pms-providers:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const isPreview = await isV0Preview()
    
    // Use service role client to bypass RLS for superadmin operations
    const supabase = await createServiceRoleClient()

    let userId: string
    let userRole: string | null = null

    if (isPreview) {
      console.log("[v0] DEV MODE - Auth bypass enabled for pms-providers POST")
      userId = V0_DEMO_USER.id
      userRole = V0_DEMO_USER.role
    } else {
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
      }
      userId = user.id
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single()
      userRole = profile?.role || null
    }

    // Verifica ruolo superadmin
    if (!userRole || !["superadmin", "super_admin"].includes(userRole)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const body = await request.json()
    const {
      name,
      code,
      description,
      website,
      commercial_contact_name,
      commercial_contact_email,
      commercial_contact_phone,
      technical_contact_name,
      technical_contact_email,
      technical_contact_phone,
      api_base_url,
      api_key,
      api_secret,
      api_username,
      api_password,
      api_extra_config,
      has_webhook,
      has_versioning,
      has_delta_sync,
      has_last_modified,
      requires_full_historization,
      sync_strategy,
    } = body

    if (!name || !code) {
      return NextResponse.json({ error: "Nome e codice sono obbligatori" }, { status: 400 })
    }

    // Crea il PMS provider
    const { data: provider, error } = await supabase
      .from("pms_providers")
      .insert({
        name,
        code: code.toLowerCase().replace(/\s+/g, "_"),
        description,
        website,
        commercial_contact_name,
        commercial_contact_email,
        commercial_contact_phone,
        technical_contact_name,
        technical_contact_email,
        technical_contact_phone,
        api_base_url,
        api_key,
        api_secret,
        api_username,
        api_password,
        api_extra_config: api_extra_config || {},
        connection_status: api_base_url ? "configured" : "not_configured",
        created_by: userId,
        has_webhook: has_webhook || false,
        has_versioning: has_versioning || false,
        has_delta_sync: has_delta_sync || false,
        has_last_modified: has_last_modified || false,
        requires_full_historization: requires_full_historization ?? true,
        sync_strategy: sync_strategy || "full",
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating PMS provider:", error)
      if (error.code === "23505") {
        return NextResponse.json({ error: "Un PMS con questo nome o codice esiste già" }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ provider })
  } catch (error) {
    console.error("Error in POST /api/superadmin/connectors/pms-providers:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const isPreview = await isV0Preview()
    
    // Use service role to bypass RLS for superadmin operations
    const supabase = await createServiceRoleClient()

    let userRole: string | null = null

    if (isPreview) {
      console.log("[v0] DEV MODE - Auth bypass enabled for pms-providers PUT")
      userRole = V0_DEMO_USER.role
    } else {
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      userRole = profile?.role || null
    }

    // Verifica ruolo superadmin
    if (!userRole || !["superadmin", "super_admin"].includes(userRole)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const body = await request.json()
    const {
      id,
      has_webhook,
      has_versioning,
      has_delta_sync,
      has_last_modified,
      requires_full_historization,
      sync_strategy,
      documents,
      available_entities,
      ...otherUpdateData
    } = body

    if (!id) {
      return NextResponse.json({ error: "ID provider obbligatorio" }, { status: 400 })
    }

    const updateData = {
      ...otherUpdateData,
      connection_status: otherUpdateData.api_base_url ? "configured" : "not_configured",
      ...(has_webhook !== undefined && { has_webhook }),
      ...(has_versioning !== undefined && { has_versioning }),
      ...(has_delta_sync !== undefined && { has_delta_sync }),
      ...(has_last_modified !== undefined && { has_last_modified }),
      ...(requires_full_historization !== undefined && { requires_full_historization }),
      ...(sync_strategy !== undefined && { sync_strategy }),
      ...(available_entities !== undefined && { available_entities }),
    }

    console.log("[v0] PUT pms-providers - updating id:", id, "with data:", JSON.stringify(updateData).slice(0, 200))

    // Aggiorna il PMS provider
    const { data: provider, error } = await supabase
      .from("pms_providers")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error updating PMS provider:", error.message, error.code, error.details)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
    }

    console.log("[v0] PUT pms-providers - success, provider:", provider?.id, provider?.name)
    return NextResponse.json({ provider })
  } catch (error) {
    console.error("Error in PUT /api/superadmin/connectors/pms-providers:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const isPreview = await isV0Preview()
    
    // Use service role client to bypass RLS for superadmin operations
    const supabase = await createServiceRoleClient()

    let userRole: string | null = null

    if (isPreview) {
      console.log("[v0] DEV MODE - Auth bypass enabled for pms-providers DELETE")
      userRole = V0_DEMO_USER.role
    } else {
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      userRole = profile?.role || null
    }

    // Verifica ruolo superadmin
    if (!userRole || !["superadmin", "super_admin"].includes(userRole)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID provider obbligatorio" }, { status: 400 })
    }

    // Elimina il PMS provider (cascade eliminerà anche i documenti)
    const { error } = await supabase.from("pms_providers").delete().eq("id", id)

    if (error) {
      console.error("Error deleting PMS provider:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/superadmin/connectors/pms-providers:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
