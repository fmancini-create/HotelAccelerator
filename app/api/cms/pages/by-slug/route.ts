import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/cms/pages/by-slug?property_id=xxx&slug=yyy - Pagina pubblica per slug
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("property_id")
    const slug = searchParams.get("slug")

    if (!propertyId || !slug) {
      return NextResponse.json({ error: "property_id e slug richiesti" }, { status: 400 })
    }

    const supabase = await createServerClient()

    const { data: page, error } = await supabase
      .from("cms_pages")
      .select("*")
      .eq("property_id", propertyId)
      .eq("slug", slug)
      .eq("status", "published")
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Pagina non trovata" }, { status: 404 })
      }
      console.error("[CMS] Error fetching page by slug:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ page })
  } catch (error) {
    console.error("[CMS] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
