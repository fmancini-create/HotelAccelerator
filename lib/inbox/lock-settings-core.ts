/**
 * Decisione pura su QUALE scadenza vale per un operatore.
 *
 * Sta in un modulo separato e senza accessi al database per un motivo preciso:
 * questa e' la regola che decide quando un messaggio si libera, e una regola
 * del genere va provata sul serio. I moduli che leggono il database portano
 * `server-only` e non sono importabili da un controllo automatico; qui invece
 * si passano le righe e si osserva la risposta.
 *
 * Il valore di fabbrica NON e' scritto qui ma arriva da fuori: la finestra di
 * presenza degli operatori e' definita in un solo punto del prodotto e non
 * deve essere ricopiata, altrimenti fra un anno i due numeri diranno cose
 * diverse.
 */

export interface RigaScadenza {
  group_id: string | null
  user_id: string | null
  idle_seconds: number
}

export interface ScadenzaRisolta {
  secondi: number
  /** Da dove viene il valore: serve a spiegarlo nel pannello, altrimenti
   *  l'amministratore vede un numero e non sa chi lo ha deciso. */
  origine: "operatore" | "gruppo" | "struttura" | "predefinito"
}

/**
 * Ordine: operatore -> gruppo -> struttura -> valore di fabbrica.
 *
 * Se l'operatore appartiene a piu' gruppi con valori diversi vince il piu'
 * LUNGO. La scelta e' voluta: il valore alto e' quello piu' protettivo per chi
 * sta scrivendo, e prendere il piu' corto significherebbe togliergli in
 * silenzio una tolleranza che un altro gruppo gli aveva concesso.
 */
export function scegliScadenza(
  righe: RigaScadenza[],
  adminUserId: string | null,
  gruppiDellOperatore: string[],
  secondiPredefiniti: number,
): ScadenzaRisolta {
  // 1) Decisione esplicita su questo operatore: vince su tutto, anche sui gruppi.
  if (adminUserId) {
    const suo = righe.find((r) => r.user_id === adminUserId)
    if (suo) return { secondi: suo.idle_seconds, origine: "operatore" }
  }

  // 2) Gruppi a cui appartiene davvero: una riga di gruppo non suo non lo riguarda.
  if (gruppiDellOperatore.length > 0) {
    const suoi = new Set(gruppiDellOperatore)
    const valori = righe
      .filter((r) => r.group_id !== null && r.user_id === null && suoi.has(r.group_id))
      .map((r) => r.idle_seconds)
    if (valori.length > 0) return { secondi: Math.max(...valori), origine: "gruppo" }
  }

  // 3) Valore della struttura: la riga senza gruppo e senza operatore.
  const struttura = righe.find((r) => r.group_id === null && r.user_id === null)
  if (struttura) return { secondi: struttura.idle_seconds, origine: "struttura" }

  return { secondi: secondiPredefiniti, origine: "predefinito" }
}
