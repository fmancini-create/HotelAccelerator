/**
 * Visibilita' delle cartelle Gmail nell'elenco inbox.
 *
 * Nascondere una cartella e' un filtro di PRESENTAZIONE: i messaggi continuano a
 * essere scaricati, restano nel sistema e nella ricerca, e riaccendendo la
 * cartella ricompaiono subito senza risincronizzare. Se invece si smettesse di
 * scaricarli, riaccendere lascerebbe un buco nello storico.
 */

/**
 * Cartella finta che rappresenta "tutte le altre": le conversazioni per cui la
 * cartella Gmail di provenienza NON e' registrata.
 *
 * Serve perche' su questa installazione la grande maggioranza delle
 * conversazioni email non ha etichette salvate (sono state sincronizzate prima
 * che venissero registrate). Senza questa voce sarebbero ingovernabili: non
 * appartengono a nessuna cartella, quindi nessun interruttore le toccherebbe.
 *
 * Il doppio trattino basso non puo' collidere con un id Gmail reale, che e'
 * `INBOX`, `SENT`, `Label_123`...
 */
export const SENZA_CARTELLA = "__NO_LABEL__"

export const SENZA_CARTELLA_NOME = "Tutte le altre"

/** Cartelle nascoste per una singola casella. */
export type CartelleNascoste = {
  /** id Gmail delle cartelle spente (senza la voce finta). */
  etichette: string[]
  /** true se e' spenta la voce "Tutte le altre". */
  senzaCartella: boolean
}

/**
 * Costruisce le condizioni PostgREST che ESCLUDONO le cartelle spente.
 *
 * Ogni stringa restituita va passata a un `.or()` distinto: i filtri di
 * PostgREST si combinano in AND fra loro, mentre le voci dentro un singolo
 * `.or()` sono in OR. Mettere tutto in un solo `.or()` significherebbe "basta
 * una condizione soddisfatta", cioe' non nascondere piu' niente.
 *
 * Le condizioni sono scritte come "cosa TENERE", perche' PostgREST filtra in
 * positivo. Da leggere: tieni la riga se non appartiene a questa casella, o se
 * la sua cartella non e' fra quelle spente.
 */
export function condizioniCartelleNascoste(perCasella: Map<string, CartelleNascoste>): string[] {
  const condizioni: string[] = []

  for (const [channelId, nascoste] of perCasella) {
    // UNA condizione per cartella spenta, non un unico `ov` con l'elenco: dentro
    // un `or()` la virgola separa le voci dell'albero logico, quindi `{A,B}`
    // verrebbe spezzato a meta' e la richiesta rifiutata. Con una cartella sola
    // sarebbe passata inosservata.
    for (const etichetta of nascoste.etichette) {
      condizioni.push(
        [
          // Le conversazioni non-email non hanno casella: senza questa voce
          // spegnere una cartella email cancellerebbe WhatsApp dall'elenco,
          // perche' in SQL `channel_id <> X` su un valore vuoto non e' "vero"
          // ma "sconosciuto", e una riga sconosciuta viene scartata.
          "channel_id.is.null",
          `channel_id.neq.${channelId}`,
          // Stessa ragione: senza etichette il confronto e' sconosciuto. Chi non
          // ha cartella registrata non lo governa questa condizione ma la voce
          // "Tutte le altre", qui sotto.
          "gmail_labels.is.null",
          // La negazione va DOPO il nome della colonna (`colonna.not.operatore`):
          // scritta prima, PostgREST rifiuta l'intera richiesta e l'inbox
          // risponde 500 invece di filtrare.
          `gmail_labels.not.cs.{"${etichetta}"}`,
        ].join(","),
      )
    }

    if (nascoste.senzaCartella) {
      condizioni.push(
        [
          "channel_id.is.null",
          `channel_id.neq.${channelId}`,
          // Tieni solo cio' che HA una cartella: ne' vuoto ne' lista vuota.
          // `{}` e' un elenco vuoto, diverso da "assente", e vanno esclusi
          // entrambi o meta' delle conversazioni sfuggirebbe alla scelta.
          "and(gmail_labels.not.is.null,gmail_labels.not.eq.{})",
        ].join(","),
      )
    }
  }

  return condizioni
}

/** Vero se la casella ha almeno una cartella spenta. */
export function haCartelleNascoste(nascoste: CartelleNascoste | undefined): boolean {
  if (!nascoste) return false
  return nascoste.etichette.length > 0 || nascoste.senzaCartella
}
