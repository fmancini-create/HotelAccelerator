import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { getModulesWithState } from "@/lib/modules"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/modules
 * Elenca tutti i moduli del catalogo con lo stato (attivo/inattivo, piano,
 * scadenza) per la struttura corrente. Alimenta la pagina "Moduli".
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Service client: l'auth e' gia' verificata sopra e filtriamo per propertyId.
    const supabase = createServiceClient()
    const modules = await getModulesWithState(supabase, propertyId)

    return NextResponse.json({ propertyId, modules })
  } catch (error) {
    console.error("[v0] Modules GET error:", error)
    return NextResponse.json({ error: "Failed to fetch modules" }, { status: 500 })
  }
}
