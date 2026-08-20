import { NextResponse, type NextRequest } from "next/server"

import { requireAreaApi } from "@/lib/auth/area-access"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { computeOperatorPerformance, GIORNI_PREDEFINITI } from "@/lib/platform/operator-performance"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // Area "tracking": e' la chiave vera del catalogo che governa le statistiche.
    await requireAreaApi("tracking", request)

    const chi = await getCallerIdentity(request)
    if (!chi?.propertyId) {
      return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })
    }

    // Le performance delle persone sono un dato sensibile: le vede chi amministra.
    // Un collaboratore non deve poter confrontare la propria velocita' con quella
    // dei colleghi senza che la direzione lo abbia deciso.
    if (!chi.isTenantAdmin && !chi.isSuperAdmin) {
      return NextResponse.json({ error: "Riservato a chi amministra la struttura" }, { status: 403 })
    }

    // Un valore non valido NON deve allargare la finestra in silenzio: `?days=abc`
    // che apre tutto lo storico e' un difetto che ho gia' corretto sugli invii email.
    const grezzo = request.nextUrl.searchParams.get("days")
    let giorni = GIORNI_PREDEFINITI
    if (grezzo !== null) {
      const n = Number(grezzo)
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        return NextResponse.json(
          { error: `Parametro "days" non valido: atteso un intero fra 1 e 365, ricevuto "${grezzo}"` },
          { status: 400 },
        )
      }
      giorni = n
    }

    const sb = createServiceClient()
    const risultato = await computeOperatorPerformance(sb, chi.propertyId, giorni)

    return NextResponse.json(risultato)
  } catch (errore) {
    if (errore instanceof NextResponse) return errore
    if (errore && typeof errore === "object" && "status" in errore) {
      return NextResponse.json({ error: "Accesso negato" }, { status: Number((errore as any).status) || 403 })
    }
    console.error("[v0] operator-performance:", errore)
    return NextResponse.json({ error: "Errore nel calcolo delle performance" }, { status: 500 })
  }
}
