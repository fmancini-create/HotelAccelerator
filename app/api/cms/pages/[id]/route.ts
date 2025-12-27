import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { validatePage, ZodError } from "@/lib/cms/section-schemas"

// GET /api/cms/pages/[id] - Singola pagina
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const supabase = await createServerClient()

    const { data: page, error } = await supabase.from("cms_pages").select("*").eq("id", id).single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
      }
      console.error("[CMS] Error fetching page:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[CMS] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// PUT /api/cms/pages/[id] - Aggiorna pagina
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()

    let pageData
    try {
      pageData = validatePage(body)
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json({ error: err.flatten() }, { status: 400 })
      }
      throw err
    }

    const supabase = await createServerClient()

    // Verifica auth
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Verifica permessi
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("role, property_id")
      .eq("id", user.id)
      .single()

    if (!adminUser) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Verifica che la pagina appartenga alla property dell'admin
    const { data: existingPage } = await supabase.from("cms_pages").select("property_id").eq("id", id).single()

    if (!existingPage) {
      return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
    }

    if (adminUser.role !== "super_admin" && adminUser.property_id !== existingPage.property_id) {
      return NextResponse.json({ error: "Non hai accesso a questa pagina" }, { status: 403 })
    }

    // Aggiorna la pagina
    const updateData: Record<string, unknown> = {
      slug: pageData.slug,
      title: pageData.title,
      status: pageData.status,
      seo_title: pageData.seo_title,
      seo_description: pageData.seo_description,
      seo_noindex: pageData.seo_noindex,
      sections: pageData.sections,
    }

    // Se diventa published, aggiorna published_at
    if (pageData.status === "published") {
      updateData.published_at = new Date().toISOString()
    }

    const { data: page, error } = await supabase.from("cms_pages").update(updateData).eq("id", id).select().single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Slug già esistente per questa property" }, { status: 409 })
      }
      console.error("[CMS] Error updating page:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[CMS] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// DELETE /api/cms/pages/[id] - Elimina pagina
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const supabase = await createServerClient()

    // Verifica auth
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Verifica permessi
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("role, property_id")
      .eq("id", user.id)
      .single()

    if (!adminUser) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Verifica che la pagina appartenga alla property dell'admin
    const { data: existingPage } = await supabase.from("cms_pages").select("property_id").eq("id", id).single()

    if (!existingPage) {
      return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
    }

    if (adminUser.role !== "super_admin" && adminUser.property_id !== existingPage.property_id) {
      return NextResponse.json({ error: "Non hai accesso a questa pagina" }, { status: 403 })
    }

    const { error } = await supabase.from("cms_pages").delete().eq("id", id)

    if (error) {
      console.error("[CMS] Error deleting page:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[CMS] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
