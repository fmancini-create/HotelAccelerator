import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError, isExpectedAuthError } from "@/lib/errors"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
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
    // Sessione scaduta/assente: condizione attesa, va distinta dal guasto.
    if (isExpectedAuthError(error)) return handleServiceError(error)
    return NextResponse.json({ error: error.message, templates: [] }, { status: 500 })
  }
}
