import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { MINUTI_PRESENZA } from "@/lib/operators/presence"
import { scegliScadenza, type RigaScadenza, type ScadenzaRisolta } from "@/lib/inbox/lock-settings-core"

export type { ScadenzaRisolta }

/**
 * Quanto resta "in lavorazione" un messaggio quando l'operatore smette di
 * scrivere.
 *
 * Perche' e' configurabile e non un numero fisso: un ricevimento con due
 * persone al banco e una casella condivisa ha bisogno che i messaggi si
 * liberino in fretta; un ufficio commerciale che prepara preventivi lunghi ha
 * bisogno dell'opposto. Un valore unico avrebbe torto in almeno uno dei due
 * casi.
 *
 * Tre livelli, come chiesto: struttura, gruppo, singolo operatore.
 */

/** Il valore di fabbrica coincide con la finestra di presenza degli operatori:
 *  se un operatore risulta assente dal prodotto, non ha senso che continui a
 *  tenere occupato un messaggio. Un solo numero da spiegare, non due. */
export const SECONDI_INATTIVITA_PREDEFINITI = MINUTI_PRESENZA * 60

/** Limiti accettati, coerenti con il vincolo scritto nel database. Sotto i 30
 *  secondi il blocco cadrebbe mentre l'operatore pensa alla frase; oltre le 24
 *  ore non sarebbe piu' una scadenza. */
export const SECONDI_INATTIVITA_MIN = 30
export const SECONDI_INATTIVITA_MAX = 86400

/** Risolve la scadenza per un operatore preciso leggendo le impostazioni della
 *  struttura; l'ordine di precedenza e' spiegato in `lock-settings-core`. */
export async function risolviScadenzaBlocco(
  propertyId: string,
  adminUserId: string | null,
): Promise<ScadenzaRisolta> {
  const supabase = createServiceClient()

  const { data: righe, error } = await supabase
    .from("conversation_lock_settings")
    .select("group_id, user_id, idle_seconds")
    .eq("property_id", propertyId)

  if (error) {
    // Senza impostazioni leggibili si usa il valore di fabbrica: il blocco
    // continua a funzionare. Il guasto opposto (nessuna scadenza) lascerebbe
    // messaggi occupati per sempre.
    console.error("[v0] scadenza blocco: lettura fallita:", error.message)
    return { secondi: SECONDI_INATTIVITA_PREDEFINITI, origine: "predefinito" }
  }

  // La forma della riga e' dichiarata qui perche' i tipi generati di Supabase
  // non conoscono ancora queste tabelle: senza questo il compilatore non sa
  // cosa contengono le righe lette.
  const tutte = (righe ?? []) as RigaScadenza[]

  // I gruppi si leggono solo se c'e' almeno una riga di gruppo da confrontare:
  // altrimenti sarebbe una lettura in piu' a ogni battito, per nulla.
  let gruppi: string[] = []
  if (adminUserId && tutte.some((r) => r.group_id !== null)) {
    const { data: appartenenze } = await supabase
      .from("user_group_members")
      .select("group_id")
      .eq("user_id", adminUserId)
    gruppi = ((appartenenze ?? []) as { group_id: string }[]).map((a) => a.group_id)
  }

  // La decisione vive nel modulo puro, dove e' provabile da un controllo.
  return scegliScadenza(tutte, adminUserId, gruppi, SECONDI_INATTIVITA_PREDEFINITI)
}

/** Tutte le impostazioni di una struttura, per il pannello del superadmin. */
export async function leggiImpostazioniScadenza(propertyId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversation_lock_settings")
    .select("id, group_id, user_id, idle_seconds, updated_at")
    .eq("property_id", propertyId)

  if (error) throw new Error(error.message)
  return data ?? []
}
