import { type NextRequest, NextResponse } from "next/server"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { richiediOperatore } from "@/lib/inbox/identity"
import { prendiBlocco, rilasciaBlocco, leggiBlocchiAttivi } from "@/lib/inbox/collaboration"
import { leggiBersaglio } from "@/lib/inbox/target"
import { risolviScadenzaBlocco } from "@/lib/inbox/lock-settings"

/**
 * Presa in carico di un messaggio.
 *
 * POST  = prendi o rinnova (il pannello lo chiama quando l'operatore scrive)
 * GET   = chi sta lavorando cosa, in questa struttura
 * DELETE = rilascia
 */

export async function POST(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const body = await request.json().catch(() => ({}))
    const bersaglio = leggiBersaglio(body?.target)
    if (!bersaglio) {
      return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })
    }

    const esito = await prendiBlocco({ propertyId, bersaglio, titolare })
    const scadenza = await risolviScadenzaBlocco(propertyId, titolare.adminUserId)

    return NextResponse.json({
      esito: esito.esito,
      lock: esito.blocco,
      scadeTra: esito.esito === "occupato" ? esito.scadeTra : null,
      // Il pannello usa questo valore per decidere ogni quanto battere: senza,
      // dovrebbe indovinarlo e con scadenze brevi perderebbe il blocco mentre
      // l'operatore sta ancora scrivendo.
      idleSeconds: scadenza.secondi,
    })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] blocco inbox: presa fallita:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const blocchi = await leggiBlocchiAttivi(propertyId, titolare)
    return NextResponse.json({ locks: blocchi })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] blocchi inbox: elenco fallito:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const body = await request.json().catch(() => ({}))
    const bersaglio = leggiBersaglio(body?.target)
    if (!bersaglio) {
      return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })
    }
    const rilasciato = await rilasciaBlocco({ propertyId, bersaglio, titolare })
    return NextResponse.json({ rilasciato })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] blocco inbox: rilascio fallito:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}
