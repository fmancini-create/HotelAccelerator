import { type NextRequest, NextResponse } from "next/server"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { richiediOperatore } from "@/lib/inbox/identity"
import { prendiBlocco } from "@/lib/inbox/collaboration"
import { leggiBersaglio } from "@/lib/inbox/target"
import { risolviScadenzaBlocco } from "@/lib/inbox/lock-settings"
import {
  arricchisciBlocchiCollaborativi,
  battitoCollaboratore,
  impostaDigitazioneTitolare,
  pulisciCoassegnazioniStale,
  rilasciaAccessoCollaborativo,
} from "@/lib/inbox/coassignment"

/**
 * Presa in carico di un messaggio.
 *
 * POST   = prendi/rinnova oppure rinnova come coassegnatario autorizzato
 * GET    = chi sta lavorando cosa, collaboratori e chi sta scrivendo
 * DELETE = rilascia il lock se titolare; il collaboratore smette di risultare attivo
 */
export async function POST(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const body = await request.json().catch(() => ({}))
    const bersaglio = leggiBersaglio(body?.target)
    if (!bersaglio) {
      return NextResponse.json({ error: "Messaggio non indicato" }, { status: 400 })
    }
    const typing = typeof body?.typing === "boolean" ? body.typing : undefined

    const esito = await prendiBlocco({ propertyId, bersaglio, titolare })
    const scadenza = await risolviScadenzaBlocco(propertyId, titolare.adminUserId)

    if (esito.esito === "occupato") {
      const collaboratore = await battitoCollaboratore({
        propertyId,
        target: bersaglio,
        holderKey: esito.blocco.titolare.key,
        actor: titolare,
        typing,
      })
      if (collaboratore) {
        return NextResponse.json({
          esito: "collaboratore",
          lock: esito.blocco,
          scadeTra: null,
          idleSeconds: scadenza.secondi,
          canWrite: true,
        })
      }
      return NextResponse.json({
        esito: "occupato",
        lock: esito.blocco,
        scadeTra: esito.scadeTra,
        idleSeconds: scadenza.secondi,
        canWrite: false,
      })
    }

    // Un nuovo titolare non deve ereditare condivisioni del titolare precedente.
    await pulisciCoassegnazioniStale({ propertyId, target: bersaglio, holderKey: titolare.key })
    if (typeof typing === "boolean") {
      await impostaDigitazioneTitolare({ propertyId, target: bersaglio, actor: titolare, typing })
    }

    return NextResponse.json({
      esito: esito.esito,
      lock: esito.blocco,
      scadeTra: null,
      idleSeconds: scadenza.secondi,
      canWrite: true,
    })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] blocco inbox: presa fallita:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { titolare, propertyId } = await richiediOperatore(request)
    const blocchi = await arricchisciBlocchiCollaborativi(propertyId, titolare)
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
    const esito = await rilasciaAccessoCollaborativo({ propertyId, target: bersaglio, actor: titolare })
    return NextResponse.json({ rilasciato: esito.released, collaboratore: esito.collaborator })
  } catch (error: any) {
    if (!isAccessError(error)) console.error("[v0] blocco inbox: rilascio fallito:", error?.message)
    return NextResponse.json({ error: error?.message ?? "Errore" }, { status: accessErrorStatus(error) })
  }
}
