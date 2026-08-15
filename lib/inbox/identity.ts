import "server-only"
import type { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, AccessError } from "@/lib/auth/admin-access"
import type { Titolare } from "@/lib/inbox/collaboration"

/**
 * Chi sta lavorando, per le funzioni di collaborazione dell'inbox.
 *
 * Serve un modulo a parte perche' l'identita' qui non coincide con quella di
 * `admin_users`: un super amministratore lavora su piu' strutture e non ha una
 * scheda operatore, quindi il suo `adminUserId` e' nullo. Se il blocco si
 * appoggiasse solo a quella colonna, chi assiste il cliente non potrebbe
 * prendere in carico nulla, ed e' proprio chi interviene quando c'e' un
 * problema.
 *
 * Percio' l'identita' di confronto e' una chiave testuale sempre presente, e il
 * nome mostrato viene dal nome vero dell'operatore quando esiste.
 */

/** Il bypass di sviluppo restituisce un identificativo finto ("dev-admin-id"),
 *  e le colonne che collegano l'operatore sono di tipo uuid: passarlo cosi'
 *  com'e' farebbe rifiutare la scrittura dal database. Il collegamento resta
 *  vuoto, mentre la chiave di confronto (testuale) continua a funzionare. */
function uuidValido(valore: string | null): string | null {
  if (!valore) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valore) ? valore : null
}

export interface ContestoOperatore {
  titolare: Titolare
  propertyId: string
  isAdmin: boolean
}

/**
 * Ricava l'operatore corrente e la struttura su cui sta lavorando.
 * Solleva AccessError se non e' autenticato o se non c'e' una struttura.
 */
export async function richiediOperatore(request: NextRequest): Promise<ContestoOperatore> {
  const identita = await getCallerIdentity(request)
  if (!identita) throw new AccessError("Non autenticato", 401)
  if (!identita.propertyId) throw new AccessError("Nessuna struttura selezionata", 400)

  let label = identita.email
  const adminUserId = uuidValido(identita.adminUserId)
  if (adminUserId) {
    const supabase = createServiceClient()
    const { data } = await supabase.from("admin_users").select("name, email").eq("id", adminUserId).maybeSingle()
    // Il nome e' quello che leggeranno i colleghi in "In lavorazione da ...":
    // un indirizzo di posta al suo posto e' comprensibile ma freddo, quindi si
    // usa solo se il nome manca davvero.
    if (data?.name) label = data.name
    else if (data?.email) label = data.email
  } else if (identita.isSuperAdmin) {
    label = "Assistenza"
  }

  return {
    titolare: {
      // La chiave dell'operatore vero e' il suo id; per chi non ha scheda
      // operatore si usa l'id di autenticazione, che e' comunque univoco e
      // stabile fra una sessione e l'altra.
      key: identita.adminUserId ?? identita.userId,
      adminUserId: uuidValido(identita.adminUserId),
      label,
    },
    propertyId: identita.propertyId,
    isAdmin: identita.isSuperAdmin || identita.isTenantAdmin,
  }
}
