/**
 * Disconnessione automatica per inattivita'.
 *
 * Un computer del ricevimento lasciato aperto e' un accesso aperto. Qui si
 * decide DOPO QUANTO la sessione si chiude, combinando la scelta fatta sulla
 * singola persona con quella fatta sui suoi gruppi.
 *
 * Questo file e' volutamente PURO: non importa niente dal server, cosi' lo
 * stesso calcolo vale per la pagina delle impostazioni, per la rotta che serve
 * il valore e per il componente che fa il conto alla rovescia nel browser. Un
 * calcolo ricopiato in tre posti e' il modo in cui i tre posti iniziano a dire
 * numeri diversi.
 */

/**
 * I tempi offerti nell'elenco. Sta nel codice e non nel vincolo del database
 * (che accetta 1..480) proprio per poter aggiungere un tempo domani senza una
 * migrazione.
 */
export const TEMPI_DISCONNESSIONE = [1, 5, 10, 15, 30] as const

export type TempoDisconnessioneAmmesso = (typeof TEMPI_DISCONNESSIONE)[number]

/** Etichette pronte per l'elenco, per non ricomporle in ogni pagina. */
export function etichettaTempo(minuti: number): string {
  return minuti === 1 ? "1 minuto" : `${minuti} minuti`
}

/**
 * Un valore arriva da fuori (modulo, rotta, record vecchio): e' un tempo che
 * possiamo usare?
 *
 * Accetta SOLO i valori dell'elenco. Il database e' piu' permissivo di
 * proposito (un intervallo), ma qui siamo al confine con l'esterno: se una
 * rotta accettasse 7 minuti perche' "sta nell'intervallo", l'elenco mostrato
 * alla persona non conterrebbe piu' il valore salvato e la casella
 * apparirebbe vuota pur avendo un valore attivo.
 */
export function tempoAmmesso(valore: unknown): valore is TempoDisconnessioneAmmesso {
  return typeof valore === "number" && (TEMPI_DISCONNESSIONE as readonly number[]).includes(valore)
}

export interface GruppoConTempo {
  nome: string
  minuti: number | null | undefined
}

export interface TempoRisolto {
  /** Minuti di inattivita' concessi. `null` = nessuna disconnessione automatica. */
  minuti: number | null
  /** Da dove viene la decisione: serve a spiegarla nella pagina. */
  origine: "utente" | "gruppo" | "predefinito"
  /** Se l'ha imposto un gruppo, quale: senza il nome la persona non sa a chi chiedere. */
  nomeGruppo?: string
}

/**
 * Da chi viene il tempo, e quale.
 *
 * ORDINE: scelta esplicita sulla persona -> gruppi -> nessuna disconnessione.
 * Il valore nullo sulla persona significa "segui i gruppi": e' la stessa forma
 * usata da `can_transfer_conversations` in lib/inbox/transfer.ts, dove serve
 * distinguere "non impostato" da "impostato" perche' altrimenti i gruppi non
 * conterebbero mai nulla.
 *
 * ATTENZIONE — QUI LA REGOLA DEI PERMESSI VA ROVESCIATA.
 * Per i permessi, piu' gruppi si SOMMANO e vince il piu' permissivo: in
 * transfer.ts basta che UN gruppo conceda (`.some(... === true)`) perche' il
 * permesso ci sia. Ricopiare quella forma qui sarebbe un errore grave, perche'
 * questo non e' un permesso ma una PROTEZIONE: "il piu' permissivo" significa
 * "il tempo piu' lungo", cioe' la protezione piu' debole. Una persona aggiunta
 * a un gruppo qualsiasi con 30 minuti vedrebbe cadere i 5 minuti del suo
 * reparto, e la protezione si indebolirebbe ogni volta che si aggiunge un
 * gruppo — esattamente al contrario di quello che chi la imposta si aspetta.
 *
 * Percio' fra piu' gruppi vince il tempo PIU' BREVE. Chi vuole concedere piu'
 * tempo a una persona lo fa sulla persona, che ha la precedenza: cosi'
 * l'eccezione e' scritta dove si vede, non nascosta in una appartenenza.
 */
export function risolviTempoDisconnessione(params: {
  valoreUtente: number | null | undefined
  gruppi?: GruppoConTempo[]
}): TempoRisolto {
  // Scelta esplicita sulla persona: vince, anche se e' piu' lunga di quella dei
  // gruppi. E' il posto dove un'eccezione e' visibile a chi apre la scheda.
  if (typeof params.valoreUtente === "number") {
    return { minuti: params.valoreUtente, origine: "utente" }
  }

  const conTempo = (params.gruppi ?? []).filter(
    (g): g is { nome: string; minuti: number } => typeof g.minuti === "number",
  )

  if (conTempo.length > 0) {
    // Il piu' breve, non il piu' lungo: vedi la nota qui sopra.
    let vincente = conTempo[0]
    for (const g of conTempo) {
      if (g.minuti < vincente.minuti) vincente = g
    }
    return { minuti: vincente.minuti, origine: "gruppo", nomeGruppo: vincente.nome }
  }

  // Nessuno ha deciso: nessuna disconnessione. Volutamente, per non iniziare a
  // buttare fuori le persone solo perche' la funzione e' stata installata.
  return { minuti: null, origine: "predefinito" }
}

/**
 * Quanti secondi di preavviso dare prima di chiudere.
 *
 * Non e' un numero fisso: con 60 secondi di preavviso su un tempo di 1 minuto
 * l'avviso comparirebbe nell'istante dell'accesso, e la persona lo vedrebbe
 * sempre. Il preavviso e' quindi una frazione del tempo, con un minimo che
 * lascia il tempo di leggere e un tetto che evita un avviso interminabile.
 *
 * Misurato: 1 min -> 15s, 5 min -> 60s, 10/15/30 min -> 60s.
 */
export function secondiPreavviso(minuti: number): number {
  const totale = minuti * 60
  const quarto = Math.floor(totale * 0.25)
  return Math.min(60, Math.max(10, quarto))
}
