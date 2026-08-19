import { type NextRequest, NextResponse } from "next/server"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { richiediOperatore } from "@/lib/inbox/identity"
import { salvaBozza, leggiBozza, leggiBozzeStruttura } from "@/lib/inbox/collaboration"
import { leggiBersaglio } from "@/lib/inbox/target"

/**
 * Bozze condivise.
 *
 * Sono condivise di proposito: e' la parte della richiesta che dice "se non e'
 * inviato si salva in bozza, ma rimane gestibile anche dagli altri". Il blocco
 * cade quando l'operatore smette di scrivere, la bozza no: resta li' perche' il
 * collega del turno dopo possa riprenderla invece di ricominciare da zero.
 */

export async function PUT(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const body = await request.json().catch(() => ({}))
    const bersaglio = leggiBersaglio(body?.target)
    if (!bersaglio) {
      return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })
    }
    if (typeof body?.body !== "string") {
      return NextResponse.json({ error: "Testo non valido" }, { status: 400 })
    }

    const bozza = await salvaBozza({
      propertyId,
      bersaglio,
      titolare,
      body: body.body,
      subject: typeof body?.subject === "string" ? body.subject : null,
    })
    return NextResponse.json({ draft: bozza })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] bozza inbox: salvataggio fallito:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await richiediOperatore(request)
    const kind = request.nextUrl.searchParams.get("kind")
    const key = request.nextUrl.searchParams.get("key")

    // Senza bersaglio si chiede l'elenco: e' quello che serve alla vista "Bozze".
    if (!kind || !key) {
      const bozze = await leggiBozzeStruttura(propertyId)
      return NextResponse.json({ drafts: bozze })
    }

    const bersaglio = leggiBersaglio({ kind, key })
    if (!bersaglio) return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })

    const bozza = await leggiBozza(propertyId, bersaglio)
    return NextResponse.json({ draft: bozza })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] bozza inbox: lettura fallita:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}
