/**
 * La chiave con cui si riconosce che due numeri sono la stessa utenza.
 *
 * PERCHE' STA IN UN FILE A PARTE: la funzione viveva dentro
 * `threecx-client.ts`, che apre con `import "server-only"`. Chiunque avesse
 * avuto bisogno di riconoscere un numero fuori dal server (le regole di unione
 * col PMS, una pagina, una prova automatica) avrebbe trovato la porta chiusa e
 * si sarebbe scritto la propria versione: due modi diversi di riconoscere la
 * stessa persona finiscono per divergere, e il giorno in cui divergono nessuno
 * capisce piu' perche' un ospite viene riconosciuto in un punto e no in un
 * altro.
 *
 * `threecx-client.ts` la RI-ESPORTA, quindi i chiamanti esistenti non cambiano
 * e l'implementazione resta una sola.
 */

/**
 * Normalizza un numero per il confronto con `contacts.phone`.
 *
 * 3CX presenta il chiamante in formati diversi (`+39055123456`, `0039055...`,
 * `055123456`), mentre in rubrica i numeri sono scritti a mano. Confrontare le
 * stringhe cosi' come sono NON troverebbe quasi nulla: si confrontano le ultime
 * cifre significative, che sono la parte stabile.
 */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D+/g, "")
  if (digits.length < 6) return null // troppo corto: interni, servizi
  // Ultime 9 cifre: sufficiente a distinguere un'utenza, tollerante al prefisso
  // internazionale scritto in modi diversi.
  return digits.slice(-9)
}
