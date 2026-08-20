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

/* ───────────────── Cosa NON è una richiesta commerciale ───────────────── */

/**
 * L'estrattore legge date da qualunque email le contenga, e ha ragione a farlo:
 * il suo compito è leggere, non giudicare. Ma il risultato è che fra le righe
 * "di persone" finiscono cose che non sono richieste di un cliente.
 *
 * MISURATO sulle 27 righe non di gestionale (19/08/2026):
 *   • 6  pratiche interne da `@ibarronci.com` — rimborsi, una richiesta di
 *        intervento, un invito su calendario fra colleghe
 *   • 2  conversazioni "ZZ PROVA browser", cioè prove di qualcuno
 *   • 1  conferma del gestionale sfuggita: "Morin Deborah this is your booking
 *        confirmation", senza email mittente, quindi il segnale `method` non
 *        l'aveva riconosciuta
 *   • 18 esterne genuine, dentro cui però convivono lead veri (allotment gruppi
 *        di Topcruises, preventivi da Matrimonio.com, WhatsApp, chat dal sito) e
 *        fornitori o newsletter (caseificio, piscina, banca, Booking, BeeFamily)
 */
export type ClasseConversazione = "interna" | "prova" | "conferma_gestionale" | "lavorabile"

export interface DatiConversazione {
  contact_email?: string | null
  subject?: string | null
}

/**
 * Il dominio della struttura NON è scritto qui a mano.
 *
 * Viene da `properties.domain` (valore reale letto oggi: `ibarronci.com`).
 * Incollare il dominio nel codice avrebbe funzionato per questa struttura e
 * silenziosamente smesso di funzionare per la seconda — cioè il difetto
 * sarebbe comparso proprio quando il prodotto cresce.
 */
export function normalizzaDominio(domain: string | null | undefined): string | null {
  const d = String(domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
  return d ? d : null
}

/**
 * Riconosce una notifica del gestionale dall'OGGETTO.
 *
 * Serve perché il segnale principale (`method = regole:scidoo`) dipende dal
 * mittente, e una conversazione senza email mittente sfugge: è esattamente il
 * caso misurato di "Morin Deborah this is your booking confirmation". Una
 * prenotazione già chiusa dal motore non deve comparire come lavoro
 * commerciale da fare.
 */
export function confermaDaOggetto(subject: string | null | undefined): boolean {
  const s = String(subject ?? "").toLowerCase()
  if (!s) return false
  return s.includes("this is your booking confirmation") || s.includes("prenotazione confermata")
}

/**
 * Classifica la conversazione da cui nasce la richiesta.
 *
 * Le due esclusioni si basano su regole misurabili e non su un elenco di
 * mittenti da aggiornare a mano:
 *   • interna  → il mittente è del dominio della struttura, cioè posta di casa
 *   • prova    → l'oggetto contiene "ZZ PROVA", la convenzione già usata da chi
 *                fa verifiche sul sito
 *
 * Tutto il resto è `lavorabile`: fornitori e newsletter INCLUSI. Non li escludo
 * perché non esiste un segnale che distingua un fornitore da un lead — sono
 * tutti domini esterni — e un elenco di domini invecchierebbe al primo
 * fornitore nuovo, che ricadrebbe fra le richieste senza che nessuno lo noti.
 * Restano visibili in "Da qualificare", dove una persona li scarta in un colpo
 * d'occhio: un falso positivo davanti agli occhi costa meno di una richiesta
 * vera nascosta da una regola troppo furba.
 */
export function classificaConversazione(
  conv: DatiConversazione | null | undefined,
  dominioStruttura: string | null,
): ClasseConversazione {
  const email = String(conv?.contact_email ?? "").trim().toLowerCase()
  const subject = String(conv?.subject ?? "")

  const dominio = normalizzaDominio(dominioStruttura)
  if (dominio && email.endsWith(`@${dominio}`)) return "interna"
  if (/zz\s*prova/i.test(subject)) return "prova"
  if (confermaDaOggetto(subject)) return "conferma_gestionale"
  return "lavorabile"
}

/* ─────────────────────────── Le fasi ─────────────────────────── */

export type FaseKey = "da_qualificare" | "aperta" | "preventivo_inviato" | "confermata" | "persa"

export interface Fase {
  key: FaseKey
  etichetta: string
  descrizione: string
}

export const FASI: Fase[] = [
  {
    key: "da_qualificare",
    etichetta: "Da qualificare",
    descrizione: "Nessuna persona ha ancora deciso: qui arriva tutto ciò che l'estrattore ha letto.",
  },
  {
    key: "aperta",
    etichetta: "Richiesta aperta",
    descrizione: "Un operatore l'ha riconosciuta come richiesta da lavorare.",
  },
  {
    key: "preventivo_inviato",
    etichetta: "Preventivo inviato",
    descrizione: "C'è una tariffa preventivata inserita da un operatore.",
  },
  {
    key: "confermata",
    etichetta: "Confermata",
    descrizione: "Un operatore l'ha chiusa con una prenotazione.",
  },
  {
    key: "persa",
    etichetta: "Persa",
    descrizione: "Un operatore l'ha chiusa senza prenotazione.",
  },
]

/**
 * Fase di una riga. Solo segnali UMANI la collocano.
 *
 * ─── Perché l'esito letto dall'IA non colloca più niente ───
 *
 * Prima questa funzione dedotto la fase da `outcome`. Sembrava informativo ed
 * era sbagliato, e l'ho capito misurando: fra le righe non di gestionale gli
 * esiti sono {aperta: 14, confermata: 4}, ma dentro quei numeri convivono lead
 * veri e fornitori. Con la deduzione automatica, "Chiusura TUS114A" di
 * Topcruises appariva in **Confermata** e il caseificio in **Richiesta aperta**:
 * la pagina avrebbe raccontato trattative vinte che nessuno ha vinto e lavoro
 * aperto che non esiste.
 *
 * L'esito dell'IA resta e si vede, ma come NOTA ("l'IA ha letto: confermata"):
 * un suggerimento per chi legge, non un verdetto che muove i conteggi.
 *
 * ─── Precedenza, dichiarata ───
 *
 *   1. `stage` scelto da un operatore VINCE su tutto. È una decisione umana
 *      registrata con autore e istante: nessun ricalcolo la può scavalcare.
 *   2. Altrimenti, una tariffa inserita a mano vale come fase: scrivere una
 *      cifra è già un atto di un operatore, e l'IA non ne produce mai
 *      (misurato: 0 righe su 200 con un prezzo nel payload).
 *   3. Altrimenti "Da qualificare".
 */
export function faseDi(riga: {
  stage: string | null
  quoted_rate_cents: number | null
}): FaseKey {
  const scelta = (riga.stage ?? "").trim()
  if (scelta && FASI.some((f) => f.key === scelta)) return scelta as FaseKey
  if (riga.quoted_rate_cents !== null && riga.quoted_rate_cents > 0) return "preventivo_inviato"
  return "da_qualificare"
}

/**
 * Come mostrare l'esito letto dall'IA, senza spacciarlo per una decisione.
 *
 * Restituisce `null` quando l'IA non ha letto niente: meglio nessuna nota che
 * una nota vuota, che sembrerebbe un dato mancante invece di un'assenza.
 */
export function notaEsitoIA(outcome: string | null | undefined): string | null {
  const e = String(outcome ?? "").trim()
  if (!e) return null
  return `l'IA ha letto: ${e}`
}
