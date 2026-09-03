/**
 * Come si mostrano numeri ed esiti delle telefonate.
 *
 * Sta in un file condiviso e non dentro la pagina perche' le prove automatiche
 * devono poter chiamare la funzione VERA: una copia nel file di prova
 * continuerebbe a dire "va tutto bene" anche dopo che la pagina e' cambiata.
 */

/**
 * Il numero come lo legge chi deve richiamare.
 *
 * Lo stesso cliente arrivava scritto in due modi ("+39 335 8046836" dal
 * cellulare, "0335 8046836" dal centralino): sembravano due persone diverse pur
 * essendo lo stesso contatto in rubrica.
 *
 * Lo zero iniziale si toglie SOLO davanti a un cellulare (in Italia i cellulari
 * iniziano sempre per 3): nei numeri fissi lo zero e' parte del prefisso urbano
 * e togliendolo si otterrebbe un numero inesistente.
 */
export function numeroLeggibile(n: string | null): string {
  if (!n) return "Numero sconosciuto"
  /**
   * Lo zero di selezione davanti a un numero INTERNAZIONALE.
   *
   * Misurato in archivio: 47 numeri esteri salvati come "0+41793374549" e
   * "0+3197010241328". Quello zero e' il prefisso con cui il centralino prende
   * la linea esterna, non parte del numero: lasciandolo, il numero mostrato non
   * e' richiamabile e un olandese (+31) sembrava un numero italiano che inizia
   * per zero. Va tolto PRIMA di levare i simboli, perche' dopo il "+"
   * sparisce e "0+41..." diventerebbe "041...", indistinguibile da un prefisso
   * urbano italiano.
   */
  const ripulito = n.replace(/^0(?=\+)/, "")
  if (/^\+/.test(ripulito)) {
    // Un numero estero si restituisce con il "+" e senza raggrupparlo: le regole
    // di spaziatura italiane suggerirebbero una struttura che quel numero non ha.
    return ripulito
  }
  const cifre = ripulito.replace(/\D/g, "")
  // Si toglie il prefisso italiano (+39 / 0039) e lo zero di selezione, ma SOLO
  // quando cio' che resta e' un cellulare italiano di 10 cifre che inizia per 3.
  // Un numero estero (+33, +44...) resta come e' arrivato: raggrupparlo con le
  // regole italiane suggerirebbe una struttura che quel numero non ha.
  const candidati = [cifre, cifre.replace(/^0039/, ""), cifre.replace(/^39/, ""), cifre.replace(/^0/, "")]
  const cellulare = candidati.find((c) => c.length === 10 && c.startsWith("3"))
  if (cellulare) return `${cellulare.slice(0, 3)} ${cellulare.slice(3, 6)} ${cellulare.slice(6)}`
  return n
}

/**
 * L'etichetta dell'esito deve descrivere cio' che sa l'operatore, non far
 * sembrare guasto il PBX. `ring_group_timeout` e' una deduzione nostra: il
 * gruppo ha raggiunto il proprio timeout senza una risposta umana. Non significa
 * che il centralino sia caduto o abbia avuto un errore tecnico.
 *
 * Manteniamo visibile la differenza rispetto a una mancata risposta dichiarata
 * direttamente dal provider, ma con un testo operativo e non allarmistico.
 */
export function etichettaEsito(status: string, statusSource: string): string {
  if (status !== "missed") return "Completata"
  return statusSource === "ring_group_timeout" ? "Non risposta dal gruppo" : "Senza risposta"
}
