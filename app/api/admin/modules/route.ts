import { type NextRequest, NextResponse } from "next/server"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { getModulesWithState } from "@/lib/modules"
import { toTenantModuleViews } from "@/lib/modules/tenant-view"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/modules
 * Elenca tutti i moduli del catalogo con lo stato (attivo/inattivo, piano,
 * scadenza) per la struttura corrente. Alimenta la pagina "Moduli".
 */
export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)

    // Service client: l'auth e' gia' verificata sopra e filtriamo per propertyId.
    const supabase = createServiceClient()
    const modules = await getModulesWithState(supabase, propertyId)

    // Si manda il PREZZO, non il costo che sosteniamo noi: dal costo si legge il
    // nostro margine. `toTenantModuleViews` toglie il campo dall'oggetto, quindi
    // non finisce nel JSON nemmeno per distrazione.
    return NextResponse.json({ propertyId, modules: toTenantModuleViews(modules) })
  } catch (error) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    // 401/403 are expected access-control outcomes, not server errors.
    if (!isAccessError(error)) console.error("[v0] Modules GET error:", error)
    const status = accessErrorStatus(error)
    const message = error instanceof Error && status !== 500 ? error.message : "Failed to fetch modules"
    return NextResponse.json({ error: message }, { status })
  }
}
