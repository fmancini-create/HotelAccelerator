import { type NextRequest, NextResponse } from "next/server"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { richiediOperatore } from "@/lib/inbox/identity"
import { chiediPassaggio, rispondiPassaggio, richiestePerMe, mieRichiesteAperte, puoTrasferire } from "@/lib/inbox/transfer"
import { leggiBersaglio } from "@/lib/inbox/target"

/**
 * Richieste di passaggio.
 *
 * POST  = chiedi il passaggio di un messaggio occupato
 * PATCH = accetta o rifiuta una richiesta
 * GET   = le richieste che mi riguardano, e quelle che ho aperto io
 */

export async function POST(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const body = await request.json().catch(() => ({}))
    const bersaglio = leggiBersaglio(body?.target)
    if (!bersaglio) return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })

    const motivo = typeof body?.reason === "string" && body.reason.trim().length > 0 ? body.reason.trim() : null

    const esito = await chiediPassaggio({ propertyId, bersaglio, richiedente: titolare, motivo })
    return NextResponse.json({
      request: esito.richiesta,
      destinatario: esito.destinatario,
      giaAperta: esito.giaAperta,
    })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] passaggio inbox: richiesta fallita:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { titolare, propertyId, isAdmin } = await richiediOperatore(request)
    const body = await request.json().catch(() => ({}))
    if (typeof body?.requestId !== "string" || typeof body?.grant !== "boolean") {
      return NextResponse.json({ error: "Richiesta non indicata" }, { status: 400 })
    }

    const esito = await rispondiPassaggio({
      propertyId,
      richiestaId: body.requestId,
      chiRisponde: titolare,
      isAdmin,
      concedi: body.grant,
    })

    if (!esito.ok) {
      // 409: la richiesta esiste ma non e' in uno stato che accetta risposta,
      // oppure chi risponde non e' la persona giusta. Non e' un guasto del
      // server, quindi non un 500.
      return NextResponse.json({ error: esito.motivo }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] passaggio inbox: risposta fallita:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { titolare, propertyId, isAdmin } = await richiediOperatore(request)
    const [daGestire, mie, permesso] = await Promise.all([
      richiestePerMe({ propertyId, titolare, isAdmin }),
      mieRichiesteAperte(propertyId, titolare.key),
      puoTrasferire({ adminUserId: titolare.adminUserId, isAdmin }),
    ])
    return NextResponse.json({ incoming: daGestire, mine: mie, canTransfer: permesso.puo })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] passaggio inbox: elenco fallito:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}
