import "server-only"
import { createServiceClient } from "@/lib/supabase/server"

/**
 * Presenza degli operatori, e regola di ricaduta dell'assistente.
 *
 * Perche' esiste: in modalita' "su richiesta" l'IA prepara una bozza e aspetta
 * che un operatore la approvi. Di notte, o a ufficio chiuso, quella bozza non
 * viene approvata da nessuno e l'ospite resta senza risposta: il caso peggiore,
 * perche' e' esattamente quando scrive chi non ha trovato un numero da chiamare.
 *
 * La regola sta QUI e non nelle rotte perche' "operatore attivo" deve voler dire
 * la stessa cosa in ogni punto del prodotto: due definizioni divergenti sono il
 * modo piu' facile per ritrovarsi con due comportamenti diversi sullo stesso
 * hotel.
 */

/** Un operatore conta come presente se ha dato segno di vita entro questo tempo.
 *
 *  Il valore e' un compromesso dichiarato: il battito arriva ogni minuto, quindi
 *  3 minuti tollerano un paio di battiti persi (rete lenta, scheda in secondo
 *  piano) senza dichiarare "assente" chi e' davvero alla scrivania. Alzarlo
 *  troppo avrebbe l'effetto opposto: le chat restano in bozza per un operatore
 *  che ha chiuso il computer da un quarto d'ora. */
export const MINUTI_PRESENZA = 3

/** Registra il battito dell'operatore. Idempotente: una riga per operatore. */
export async function segnalaPresenza(adminUserId: string, propertyId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from("operator_presence").upsert(
    {
      admin_user_id: adminUserId,
      property_id: propertyId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "admin_user_id" },
  )
  // Un battito perso non deve far fallire la pagina che lo invia: al massimo
  // l'operatore risulta assente e l'assistente risponde da solo, che e' la
  // ricaduta prudente.
  if (error) console.error("[v0] presenza operatore: battito non registrato:", error.message)
}

/** C'e' almeno un operatore attivo per questa struttura in questo momento? */
export async function operatoreAttivo(propertyId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const soglia = new Date(Date.now() - MINUTI_PRESENZA * 60_000).toISOString()
  const { count, error } = await supabase
    .from("operator_presence")
    .select("admin_user_id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .gte("last_seen_at", soglia)

  if (error) {
    // Se non riusciamo a saperlo, diciamo "nessun operatore": l'ospite riceve
    // una risposta automatica. L'errore opposto (credere che ci sia un operatore
    // che non c'e') lascia il messaggio senza risposta, ed e' il piu' costoso.
    console.error("[v0] presenza operatore: lettura fallita:", error.message)
    return false
  }
  return (count ?? 0) > 0
}
