import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createServiceClient } from "@/lib/supabase/server"
import { getActiveModuleKeys } from "@/lib/modules"

export const dynamic = "force-dynamic"

/**
 * GET /api/platform/modules
 * Restituisce le chiavi dei moduli ATTIVI per la struttura corrente.
 * Usato dal menu della piattaforma per mostrare/nascondere le sezioni.
 */
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ activeModules: [] }, { status: 401 })
    }
    const supabase = createServiceClient()
    const keys = await getActiveModuleKeys(supabase, propertyId)
    return NextResponse.json({ activeModules: Array.from(keys) })
  } catch (error) {
    console.error("[v0] Platform modules GET error:", error)
    // In caso di errore non rompiamo il menu: mostriamo tutto (fail-open soft).
    return NextResponse.json({ activeModules: null })
  }
}
