import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth-property"
import { MINUTI_PRESENZA, operatoreAttivo, segnalaPresenza } from "@/lib/operators/presence"

export const dynamic = "force-dynamic"

/**
 * Battito di presenza dell'operatore.
 *
 * Lo invia il pannello mentre e' aperto. Non esiste modo di sapere che un
 * operatore ha chiuso il portatile o perso la rete: per questo la presenza e' un
 * tempo che scade da solo, e non un interruttore "sono disponibile" che
 * resterebbe acceso per sempre dopo un blackout, tenendo le chat in attesa di
 * qualcuno che non c'e'.
 */

/**
 * `getAuthenticatedUser` restituisce due forme diverse: nel percorso di sviluppo
 * `id`/`property_id`, in quello autenticato `adminUserId`/`propertyId`. Leggere
 * solo una delle due farebbe passare un `undefined` al database.
 */
function identita(utente: Record<string, unknown>) {
  const adminUserId = (utente.adminUserId ?? utente.id) as string | undefined
  const propertyId = (utente.propertyId ?? utente.property_id) as string | undefined
  return { adminUserId, propertyId }
}

export async function POST(request: NextRequest) {
  try {
    const { adminUserId, propertyId } = identita(await getAuthenticatedUser(request))
    if (!adminUserId || !propertyId) {
      return NextResponse.json({ error: "Utente senza struttura" }, { status: 403 })
    }

    await segnalaPresenza(adminUserId, propertyId)
    return NextResponse.json({ ok: true, validoPerMinuti: MINUTI_PRESENZA })
  } catch {
    // Il battito e' un segnale accessorio: se la sessione e' scaduta si risponde
    // 401 e il pannello smette di insistere, senza mostrare errori all'operatore.
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }
}

/** Stato attuale: il pannello mostra cosa fara' l'assistente in questo momento. */
export async function GET(request: NextRequest) {
  try {
    const { propertyId } = identita(await getAuthenticatedUser(request))
    if (!propertyId) return NextResponse.json({ error: "Utente senza struttura" }, { status: 403 })

    return NextResponse.json({
      operatoreAttivo: await operatoreAttivo(propertyId),
      minutiPresenza: MINUTI_PRESENZA,
    })
  } catch {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }
}
