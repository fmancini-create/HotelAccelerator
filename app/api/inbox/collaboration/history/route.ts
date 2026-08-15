import { type NextRequest, NextResponse } from "next/server"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { richiediOperatore } from "@/lib/inbox/identity"
import { leggiCronologia } from "@/lib/inbox/collaboration"
import { leggiBersaglio } from "@/lib/inbox/target"

/**
 * Cronologia di un messaggio: chi l'ha preso in carico, chi ha scritto la
 * bozza, chi ha chiesto il passaggio, chi ha inviato.
 *
 * Sola lettura, e in sola aggiunta a monte: la traccia serve a ricostruire cosa
 * e' successo, quindi non esiste una via per correggerla dopo il fatto.
 */
export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await richiediOperatore(request)
    const kind = request.nextUrl.searchParams.get("kind")
    const key = request.nextUrl.searchParams.get("key")
    const bersaglio = leggiBersaglio({ kind, key })
    if (!bersaglio) return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })

    const voci = await leggiCronologia(propertyId, bersaglio)
    return NextResponse.json({ history: voci })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] cronologia inbox: lettura fallita:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}
