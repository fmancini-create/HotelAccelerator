import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica ruolo superadmin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get("providerId")

    if (!providerId) {
      return NextResponse.json({ error: "providerId obbligatorio" }, { status: 400 })
    }

    const { data: documents, error } = await supabase
      .from("pms_provider_documents")
      .select("*")
      .eq("pms_provider_id", providerId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching documents:", error)
      // Se la tabella non ha alcune colonne, restituisci array vuoto invece di errore
      return NextResponse.json({ documents: [] })
    }

    return NextResponse.json({ documents: documents || [] })
  } catch (error) {
    console.error("Error in GET /api/superadmin/connectors/pms-providers/documents:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica ruolo superadmin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const body = await request.json()
    const { pms_provider_id, file_name, file_type, content_text, parsed_endpoints, parsed_capabilities, notes } = body

    if (!pms_provider_id || !file_name) {
      return NextResponse.json({ error: "Dati documento incompleti" }, { status: 400 })
    }

    const { data: document, error } = await supabase
      .from("pms_provider_documents")
      .insert({
        pms_provider_id,
        document_name: file_name,
        document_type: file_type || "api_documentation",
        content: content_text,
        metadata: {
          parsed_endpoints: parsed_endpoints || [],
          parsed_capabilities: parsed_capabilities || {},
          notes: notes || "",
          file_size: content_text?.length || 0,
        },
        uploaded_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating document:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error("Error in POST /api/superadmin/connectors/pms-providers/documents:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica ruolo superadmin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID documento obbligatorio" }, { status: 400 })
    }

    const { error } = await supabase.from("pms_provider_documents").delete().eq("id", id)

    if (error) {
      console.error("Error deleting document:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/superadmin/connectors/pms-providers/documents:", error)
    return NextResponse.json({ error: "Errore interno del server" }, { status: 500 })
  }
}
