import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { validatePage } from "@/lib/cms/section-schemas"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

// GET /api/cms/pages - Lista pagine per property
export async function GET(request: Request) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = await createServerClient()

    const { data: pages, error } = await supabase
      .from("cms_pages")
      .select("id, slug, title, status, created_at, updated_at, published_at")
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("[CMS] Error fetching pages:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ pages })
  } catch (error) {
    console.error("[CMS] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// POST /api/cms/pages - Crea nuova pagina
export async function POST(request: Request) {
  try {
    const authenticatedPropertyId = await getAuthenticatedPropertyId()

    const body = await request.json()

    // Validazione con Zod
    const validation = validatePage(body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const pageData = validation.data

    pageData.property_id = authenticatedPropertyId

    const supabase = await createServerClient()

    const { data: page, error } = await supabase
      .from("cms_pages")
      .insert({
        property_id: pageData.property_id,
        slug: pageData.slug,
        title: pageData.title,
        status: pageData.status,
        seo_title: pageData.seo_title,
        seo_description: pageData.seo_description,
        seo_noindex: pageData.seo_noindex,
        sections: pageData.sections,
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Slug già esistente per questa property" }, { status: 409 })
      }
      console.error("[CMS] Error creating page:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ page }, { status: 201 })
  } catch (error) {
    console.error("[CMS] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
