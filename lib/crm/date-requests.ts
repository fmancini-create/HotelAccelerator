/**
 * Da estrazione della domanda a richiesta di date (la "pipeline" del CRM).
 *
 * Questo file contiene SOLO logica pura: nessun accesso al database, nessun
 * `server-only`. Serve a poterlo provare eseguendo il codice vero invece di una
 * copia — la regola delle fasi e la distinzione fra i due blocchi sono la parte
 * che sbaglia in silenzio, quindi devono stare sotto prova.
 *
 * ─── Cosa c'è davvero nei dati (misurato il 19/08/2026, non stimato) ───
 *
 *   1.333 estrazioni in archivio, di cui:
 *     • 188 con una data di arrivo VERA
 *         - 173 `prenotazione_camera` / `regole:scidoo`
 *         - 15  `domanda` / `modello`
 *     • 12 `domanda` / `modello` con la chiave `arrivo` PRESENTE ma nulla
 *
 * Le 12 senza data non si buttano: 10 di loro hanno esito "aperta", cioè sono
 * richieste di persone ancora da lavorare. Scartarle perché manca una data
 * significherebbe nascondere proprio il lavoro da fare. `requested_check_in` è
 * nullable, quindi la tabella le regge; la pagina dichiara "date non estratte".
 *
 * ─── Perché due blocchi separati e mai sommati ───
 *
 * Le 173 righe di Scidoo sono CONFERME di prenotazioni già fatte sul sito:
 * arrivano da `reservation@scidoo.com` con oggetto "this is your booking
 * confirmation". Chiamarle "trattative" attribuirebbe al lavoro commerciale ciò
 * che ha fatto il sito. Un altro modulo del progetto già lo dichiara
 * (`lib/platform/operator-performance.ts`: «attribuirle a un operatore sarebbe
 * un merito inventato»), e questo file tiene la stessa linea.
 *
 * La distinzione si legge da `method` sull'estrazione, che è un dato REGISTRATO
 * al momento della lettura, non un indovinello sul mittente. Verificata su
 * tutte e 200: `regole:scidoo` e `modello` combaciano al 100% con la
 * classificazione per mittente (`isNoReplyExpected`), cioè due segnali
 * indipendenti dicono la stessa cosa.
 */

/** Riga di `conversation_extractions` per quel che serve qui. */
export interface EstrazioneDomanda {
  id: string
  property_id: string
  conversation_id: string | null
  kind: string | null
  method: string | null
  payload: Record<string, unknown> | null
}

/** Riga da scrivere in `contact_date_requests`. */
export interface RigaRichiesta {
  property_id: string
  conversation_id: string | null
  contact_id: string | null
  requested_check_in: string | null
  requested_check_out: string | null
  nights: number | null
  guests_adults: number | null
  guests_children: number | null
  room_type_requested: string | null
  outcome: string | null
  source: string
  external_ref: string
}

/**
 * Provenienza della riga. Sta in `source`, che partecipa all'indice univoco:
 * la distinzione fra i due blocchi si legge dalla riga senza dover ricaricare
 * la conversazione.
 */
export type Provenienza = "scidoo" | "myrestoo" | "conversazione"

export function provenienzaDa(method: string | null | undefined): Provenienza {
  const m = String(method ?? "")
  if (m.startsWith("regole:scidoo")) return "scidoo"
  if (m.startsWith("regole:myrestoo")) return "myrestoo"
  return "conversazione"
}

/**
 * Acquisita dal sito = letta con regole da una notifica del gestionale.
 *
 * Non è una preferenza di presentazione: decide in quale dei due blocchi finisce
 * la riga, e quindi se un numero racconta lavoro commerciale o traffico del
 * sito.
 */
export function acquisitaDalSito(source: string): boolean {
  return source === "scidoo" || source === "myrestoo"
}

function numeroOppureNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return null
}

function dataOppureNull(v: unknown): string | null {
  if (typeof v !== "string") return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/**
 * Notti: dal payload se c'è, altrimenti calcolate dalle due date.
 *
 * Il calcolo è aritmetica su date reali, non una stima: se una delle due manca
 * il risultato è `null` e la pagina lo dichiara. Le estrazioni del modello non
 * portano `notti` (misurato: la chiave esiste solo nei 173 payload di Scidoo),
 * quindi senza questo calcolo la colonna sarebbe vuota per tutte le richieste
 * di persone — quelle che contano.
 */
export function nottiDa(payload: Record<string, unknown>, arrivo: string | null, partenza: string | null): number | null {
  const dichiarate = numeroOppureNull(payload.notti)
  if (dichiarate !== null) return dichiarate
  if (!arrivo || !partenza) return null
  const giorni = Math.round((Date.parse(partenza) - Date.parse(arrivo)) / 86_400_000)
  return Number.isFinite(giorni) && giorni > 0 ? giorni : null
}

/**
 * Traduce un'estrazione in una riga di richiesta.
 *
 * Restituisce `null` quando l'estrazione non parla di date: `kind` di servizio
 * come `nessuna_domanda`, `chiamata` o `formato_non_riconosciuto` non sono
 * richieste, e la chiave `arrivo` assente significa che il campo non è stato
 * nemmeno cercato.
 *
 * `external_ref` è SEMPRE valorizzato, perché l'indice univoco è parziale
 * (`WHERE external_ref IS NOT NULL`): una riga senza riferimento non sarebbe
 * protetta dai doppioni.
 *
 * La chiave NON è l'id dell'estrazione ma `conversazione|arrivo|partenza`, ed è
 * una scelta ragionata: l'estrattore rilegge la stessa conversazione a ogni
 * nuova versione di configurazione, generando una nuova estrazione con un nuovo
 * id. Con l'id come chiave ogni ritocco alla configurazione del "Cervello"
 * avrebbe duplicato l'intera pipeline. Con la conversazione e le date, la
 * seconda lettura della stessa domanda incontra l'indice e viene riconosciuta
 * come già fatta. Verificato sui dati veri: 200 chiavi distinte su 200
 * estrazioni, quindi oggi la chiave non fonde righe diverse.
 *
 * Limite dichiarato: se una rilettura CORREGGE le date, la riga nuova convive
 * con quella vecchia invece di sostituirla. Non lo risolvo di nascosto con una
 * cancellazione, perché scegliere quale delle due sia giusta è una decisione da
 * prendere con dati alla mano, non da indovinare qui.
 */
export function traduciEstrazione(e: EstrazioneDomanda, contactId: string | null): RigaRichiesta | null {
  const payload = e.payload
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  // La chiave deve esistere: se il campo non è stato cercato, non c'è richiesta.
  if (!("arrivo" in payload)) return null

  const arrivo = dataOppureNull(payload.arrivo)
  const partenza = dataOppureNull(payload.partenza)
  const esito = typeof payload.esito === "string" && payload.esito.trim() ? payload.esito.trim() : null

  // Senza data E senza esito non resta niente da mostrare: sarebbe una riga
  // vuota che gonfia i conteggi.
  if (!arrivo && !esito) return null

  return {
    property_id: e.property_id,
    conversation_id: e.conversation_id,
    contact_id: contactId,
    requested_check_in: arrivo,
    requested_check_out: partenza,
    nights: nottiDa(payload, arrivo, partenza),
    guests_adults: numeroOppureNull(payload.ospiti),
    // Mai presenti nei payload misurati: restano NULL, che significa "non
    // rilevato". Scrivere 0 direbbe "zero bambini", che è un'altra cosa.
    guests_children: null,
    room_type_requested: null,
    outcome: esito,
    source: provenienzaDa(e.method),
    external_ref: riferimentoStabile(e, arrivo, partenza),
  }
}

/**
 * Chiave di unicità della richiesta.
 *
 * Senza conversazione (non dovrebbe capitare, ma la colonna è nullable) si
 * ripiega sull'id dell'estrazione: meglio una riga protetta da una chiave meno
 * espressiva che una riga fuori dall'indice parziale, cioè senza protezione.
 */
export function riferimentoStabile(
  e: Pick<EstrazioneDomanda, "id" | "conversation_id">,
  arrivo: string | null,
  partenza: string | null,
): string {
  if (!e.conversation_id) return `estrazione:${e.id}`
  return `conv:${e.conversation_id}|${arrivo ?? "senza-arrivo"}|${partenza ?? "senza-partenza"}`
}

/* ─────────────────────────── Le fasi ─────────────────────────── */

export type FaseKey = "da_qualificare" | "aperta" | "preventivo_inviato" | "confermata" | "persa"

export interface Fase {
  key: FaseKey
  etichetta: string
  descrizione: string
  /**
   * Se falso, la colonna compare solo quando ha almeno una riga.
   *
   * Serve per "persa": nessuna estrazione produce quell'esito (misurato: solo
   * "aperta", "confermata" e null), quindi una colonna sempre vuota
   * suggerirebbe un dato che non esiste. Le altre quattro sono tutte
   * raggiungibili, "Preventivo inviato" perché la tariffa si inserisce a mano.
   */
  sempreVisibile: boolean
}

export const FASI: Fase[] = [
  {
    key: "da_qualificare",
    etichetta: "Da qualificare",
    descrizione: "L'estrazione non ha rilevato un esito: va letta da una persona.",
    sempreVisibile: true,
  },
  {
    key: "aperta",
    etichetta: "Richiesta aperta",
    descrizione: "Il cliente ha chiesto disponibilità e non ha ancora una risposta chiusa.",
    sempreVisibile: true,
  },
  {
    key: "preventivo_inviato",
    etichetta: "Preventivo inviato",
    descrizione: "C'è una tariffa preventivata inserita da un operatore.",
    sempreVisibile: true,
  },
  {
    key: "confermata",
    etichetta: "Confermata",
    descrizione: "La richiesta si è chiusa con una prenotazione.",
    sempreVisibile: true,
  },
  {
    key: "persa",
    etichetta: "Persa",
    descrizione: "Chiusa senza prenotazione.",
    sempreVisibile: false,
  },
]

/**
 * Fase di una riga, dedotta dall'esito estratto e dalla tariffa inserita a mano.
 *
 * Precedenza dichiarata, perché i due segnali possono coesistere: un esito
 * chiuso (confermata/persa) VINCE sulla tariffa. Una richiesta confermata con un
 * preventivo dentro è confermata — retrocederla a "Preventivo inviato" perché
 * qualcuno ha scritto una cifra farebbe sparire una vendita dalla colonna
 * giusta.
 */
export function faseDi(riga: { outcome: string | null; quoted_rate_cents: number | null }): FaseKey {
  const esito = (riga.outcome ?? "").toLowerCase()
  if (esito === "confermata" || esito === "confirmed") return "confermata"
  if (esito === "persa" || esito === "lost") return "persa"
  if (riga.quoted_rate_cents !== null && riga.quoted_rate_cents > 0) return "preventivo_inviato"
  if (esito === "aperta" || esito === "open") return "aperta"
  return "da_qualificare"
}
