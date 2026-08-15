import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { MINUTI_PRESENZA } from "@/lib/operators/presence"

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

export interface ScadenzaRisolta {
  secondi: number
  /** Da dove viene il valore: serve a spiegarlo nel pannello, altrimenti
   *  l'amministratore vede un numero e non sa chi lo ha deciso. */
  origine: "operatore" | "gruppo" | "struttura" | "predefinito"
}

/**
 * Risolve la scadenza per un operatore preciso.
 *
 * Ordine: operatore -> gruppo -> struttura -> valore di fabbrica.
 *
 * Se l'operatore appartiene a piu' gruppi con valori diversi vince il piu'
 * LUNGO. La scelta e' voluta: il valore alto e' quello piu' protettivo per chi
 * sta scrivendo, e prendere il piu' corto significherebbe togliere in silenzio
 * una tolleranza che un altro gruppo gli aveva concesso.
 */
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

  const tutte = righe ?? []

  // 1) Decisione esplicita su questo operatore: vince su tutto.
  if (adminUserId) {
    const suo = tutte.find((r) => r.user_id === adminUserId)
    if (suo) return { secondi: suo.idle_seconds, origine: "operatore" }
  }

  // 2) Gruppi a cui appartiene.
  if (adminUserId) {
    const perGruppo = tutte.filter((r) => r.group_id !== null)
    if (perGruppo.length > 0) {
      const { data: appartenenze } = await supabase
        .from("user_group_members")
        .select("group_id")
        .eq("user_id", adminUserId)

      const suoi = new Set((appartenenze ?? []).map((a: { group_id: string }) => a.group_id))
      const valori = perGruppo.filter((r) => suoi.has(r.group_id as string)).map((r) => r.idle_seconds)
      if (valori.length > 0) return { secondi: Math.max(...valori), origine: "gruppo" }
    }
  }

  // 3) Valore della struttura.
  const struttura = tutte.find((r) => r.group_id === null && r.user_id === null)
  if (struttura) return { secondi: struttura.idle_seconds, origine: "struttura" }

  return { secondi: SECONDI_INATTIVITA_PREDEFINITI, origine: "predefinito" }
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
