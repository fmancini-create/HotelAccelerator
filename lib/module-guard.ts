import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createClient } from "@/lib/supabase/server"

type ModuleFlag = "inbox_enabled" | "cms_enabled" | "ai_enabled" | "frontend_enabled"

/**
 * Verifica che un modulo sia abilitato per la property dell'utente autenticato.
 * Ritorna null se il modulo e' abilitato, altrimenti una NextResponse 403.
 *
 * Uso:
 *   const guard = await checkModuleEnabled(request, "inbox_enabled")
 *   if (guard) return guard
 */
export async function checkModuleEnabled(
  request: NextRequest,
  flag: ModuleFlag
): Promise<NextResponse | null> {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("properties")
      .select(flag)
      .eq("id", propertyId)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: "Struttura non trovata" },
        { status: 404 }
      )
    }

    if (!data[flag]) {
      return NextResponse.json(
        { error: "Modulo non abilitato per questa struttura" },
        { status: 403 }
      )
    }

    return null // Modulo abilitato, prosegui
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore di autenticazione"
    const status = message === "Non autenticato" ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
