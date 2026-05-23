import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const { data: templates, error } = await supabase
      .from("cms_templates")
      .select("id, name, slug, description, category, is_system")
      .eq("is_active", true)
      .or(`property_id.is.null,property_id.eq.${propertyId}`)
      .order("is_system", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message, templates: [] }, { status: 500 })
    }

    return NextResponse.json({ templates: templates || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, templates: [] }, { status: 500 })
  }
}
