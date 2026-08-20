/**
 * Capogruppo: chi risponde di un gruppo.
 *
 * Non e' un nuovo tipo di utente. E' una persona che, DENTRO un gruppo, ne e' il
 * responsabile: la colonna sta sull'appartenenza (`user_group_members.is_lead`),
 * quindi la stessa persona puo' guidare la Reception ed essere semplice membro
 * dell'Housekeeping.
 */

import { createServiceClient } from "@/lib/supabase/server"

/**
 * Chi puo' vedere un'area riservata ai responsabili.
 *
 * Regola: amministratore sempre; chiunque altro solo se e' capogruppo E l'area
 * gli e' stata concessa.
 *
 * Le due condizioni si sommano con una E, non con una O, ed e' la parte che
 * conta. Con una O basterebbe concedere l'area a un membro qualsiasi per
 * aprirgli una pagina pensata per i responsabili: la concessione, che qui serve
 * a RESTRINGERE, diventerebbe una scorciatoia per entrare. Ed e' il caso piu'
 * probabile, perche' concedere aree e' un'operazione di tutti i giorni.
 *
 * Detto in parole semplici: essere capogruppo non basta (serve anche il
 * permesso), e avere il permesso non basta (serve anche essere capogruppo).
 */
export function puoVedereAreaDaResponsabile(chi: {
  isAdmin: boolean
  isGroupLead: boolean
  areaConcessa: boolean
}): boolean {
  if (chi.isAdmin) return true
  return chi.isGroupLead && chi.areaConcessa
}

/**
 * true se la persona e' responsabile di ALMENO un gruppo della struttura.
 *
 * Il gruppo di cui e' responsabile non entra nella decisione: l'area mostra cosa
 * ha imparato l'agente sul gestionale, che riguarda la struttura nel suo
 * insieme e non un singolo reparto.
 *
 * In caso di errore di lettura risponde `false` (fail-closed): se non sappiamo
 * se una persona e' responsabile, NON le si apre un'area riservata. E' il
 * contrario della scelta fatta per i moduli, dove non sapere fa mostrare di
 * piu': li' si rischia di nascondere il lavoro a chi lo sta facendo, qui si
 * rischia di aprire una porta.
 */
export async function isGroupLead(propertyId: string, adminUserId: string): Promise<boolean> {
  if (!propertyId || !adminUserId) return false

  const supabase = createServiceClient()

  // Si passa dai gruppi della struttura per non contare un'appartenenza a un
  // gruppo di un'altra struttura: `user_group_members` non ha property_id.
  const { data: gruppi, error: erroreGruppi } = await supabase
    .from("user_groups")
    .select("id")
    .eq("property_id", propertyId)

  if (erroreGruppi) return false

  const idGruppi = (gruppi ?? []).map((g: { id: string }) => g.id).filter(Boolean)
  if (idGruppi.length === 0) return false

  const { data, error } = await supabase
    .from("user_group_members")
    .select("id")
    .eq("user_id", adminUserId)
    .eq("is_lead", true)
    .in("group_id", idGruppi)
    .limit(1)

  if (error) return false
  return (data ?? []).length > 0
}
