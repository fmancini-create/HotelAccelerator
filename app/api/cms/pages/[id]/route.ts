import { createServiceClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { validatePage } from "@/lib/cms/section-schemas"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

// GET /api/cms/pages/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const { data: page, error } = await supabase
      .from("cms_pages")
      .select("*")
      .eq("id", id)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!page) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
    return NextResponse.json({ page })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// PUT /api/cms/pages/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const validation = validatePage(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten() }, { status: 400 })
    }

    const pageData = validation.data
    const supabase = createServiceClient()

    // Verifica che la pagina appartenga alla property autenticata
    const { data: existingPage } = await supabase
      .from("cms_pages")
      .select("property_id")
      .eq("id", id)
      .single()

    if (!existingPage) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
    if (existingPage.property_id !== propertyId) {
      return NextResponse.json({ error: "Non hai accesso a questa pagina" }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {
      slug: pageData.slug,
      title: pageData.title,
      status: pageData.status,
      seo_title: pageData.seo_title,
      seo_description: pageData.seo_description,
      seo_noindex: pageData.seo_noindex,
      sections: pageData.sections,
    }
    if (pageData.status === "published") {
      updateData.published_at = new Date().toISOString()
    }

    const { data: page, error } = await supabase
      .from("cms_pages")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Slug già esistente" }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ page })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// DELETE /api/cms/pages/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { data: existingPage } = await supabase
      .from("cms_pages")
      .select("property_id")
      .eq("id", id)
      .single()

    if (!existingPage) return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
    if (existingPage.property_id !== propertyId) {
      return NextResponse.json({ error: "Non hai accesso a questa pagina" }, { status: 403 })
    }

    const { error } = await supabase.from("cms_pages").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
