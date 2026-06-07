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
// Casi attesi (non sono errori): visitatore non loggato o super admin
// senza tenant selezionato. getAuthenticatedPropertyId LANCIA in questi casi,
// quindi li riconosciamo dal messaggio per non sporcare i log.
const EXPECTED_AUTH_MESSAGES = ["Non autenticato", "nessun tenant selezionato", "non associato"]

function isExpectedAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return EXPECTED_AUTH_MESSAGES.some((m) => msg.includes(m))
}

export async function GET(request: NextRequest) {
  let propertyId: string
  try {
    propertyId = await getAuthenticatedPropertyId(request)
  } catch (error) {
    // Utente non autenticato / nessun tenant: caso atteso, niente log.
    // Il menu non si rompe: nessun modulo attivo da filtrare.
    if (isExpectedAuthError(error)) {
      return NextResponse.json({ activeModules: [] }, { status: 401 })
    }
    // Errore inaspettato nella risoluzione del tenant: logghiamo davvero.
    console.error("[v0] Platform modules auth error:", error)
    return NextResponse.json({ activeModules: null })
  }

  try {
    const supabase = createServiceClient()
    const keys = await getActiveModuleKeys(supabase, propertyId)
    return NextResponse.json({ activeModules: Array.from(keys) })
  } catch (error) {
    console.error("[v0] Platform modules GET error:", error)
    // In caso di errore non rompiamo il menu: mostriamo tutto (fail-open soft).
    return NextResponse.json({ activeModules: null })
  }
}
