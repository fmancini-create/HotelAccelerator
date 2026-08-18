import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Lacune di conoscenza: cosa gli ospiti chiedono e le basi non coprono.
 *
 * L'assistente risponde comunque anche quando la base non contiene la risposta
 * (modo "conversational": conversa, ma non puo' affermare fatti sulla
 * struttura). Fino a ora quel momento non lasciava traccia: la domanda scoperta
 * si perdeva nel filo della conversazione e nessuno sapeva che mancava.
 *
 * Qui la domanda diventa un CANDIDATO. Non entra in nessuna base finche' una
 * persona non approva: vedi il commento in `scripts/214_knowledge_gaps.sql` per
 * il motivo (una risposta sbagliata approvata in automatico verrebbe ripetuta a
 * tutti gli ospiti, per sempre).
 *
 * Le decisioni stanno in funzioni pure, senza database: sono le uniche righe da
 * cui dipende se un ospite verra' disturbato per niente, e devono poter essere
 * verificate una per una.
 */

/** Massima lunghezza della domanda conservata: oltre e' un racconto, non una domanda. */
const MAX_DOMANDA = 2000

/**
 * Forma normalizzata usata SOLO per riconoscere la stessa domanda ripetuta.
 *
 * "Avete la piscina?", "avete la piscina" e "AVETE LA PISCINA!!!" sono la stessa
 * domanda: senza normalizzazione diventerebbero tre righe da approvare tre
 * volte. Gli accenti cadono perche' "c'è" e "c'e'" arrivano entrambi dai
 * dispositivi degli ospiti.
 */
export function normalizzaDomanda(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

/**
 * Parole che rendono un messaggio una richiesta di informazioni.
 *
 * Serve un filtro perche' la maggior parte dei messaggi "non fondati" NON sono
 * domande: sono nomi, email e numeri di telefono che l'ospite manda quando
 * l'assistente glieli chiede per il passaggio allo staff. Misurato sui dati
 * veri: "Grazie Mancio piccio", "Mario Rossi 3351234567". Registrarli come
 * lacune riempirebbe la pagina di righe da approvare che non contengono
 * nessuna domanda, e chi deve approvare smetterebbe di guardarla.
 *
 * Meglio perdere qualche lacuna vera che sommergere una persona di rumore: una
 * domanda davvero frequente ricompare, e alla seconda volta viene registrata.
 */
const PAROLE_DI_RICHIESTA = [
  // italiano
  "avete",
  "hai",
  "c'e",
  "ce",
  "quanto",
  "quanti",
  "quante",
  "quando",
  "come",
  "dove",
  "cosa",
  "quale",
  "quali",
  "perche",
  "posso",
  "possiamo",
  "potete",
  "si puo",
  "vorrei",
  "volevo",
  "e possibile",
  "mi dica",
  "sapere",
  "informazioni",
  "orario",
  "orari",
  "prezzo",
  "prezzi",
  "costo",
  "costa",
  "tariffa",
  "tariffe",
  "disponibilita",
  "disponibile",
  "incluso",
  "compreso",
  // inglese
  "do you",
  "is there",
  "are there",
  "can i",
  "can we",
  "could you",
  "how much",
  "how many",
  "what",
  "where",
  "when",
  "which",
  "price",
  "cost",
  "available",
  "included",
  "opening",
]

/**
 * Il messaggio chiede qualcosa?
 *
 * Un punto di domanda basta. Altrimenti serve una parola di richiesta: senza
 * questo vincolo qualunque frase dell'ospite finirebbe nella coda di
 * approvazione.
 */
export function sembraUnaDomanda(testo: string): boolean {
  const pulito = normalizzaDomanda(testo)
  if (!pulito) return false

  // Almeno tre parole: "ok grazie" o "Mario Rossi" non sono richieste.
  const parole = pulito.split(" ").filter(Boolean)
  if (parole.length < 3) return false

  if (testo.includes("?")) return true
  return PAROLE_DI_RICHIESTA.some((p) => pulito.includes(p))
}

export interface ValutazioneLacuna {
  /** Il messaggio era solo un saluto: non contiene nessuna domanda. */
  soloSaluto: boolean
  /** La base copriva la domanda (somiglianza sopra la soglia). */
  fondata: boolean
  /** Il messaggio in arrivo dell'ospite. */
  domanda: string
}

/**
 * Questa richiesta e' una lacuna della base di conoscenza?
 *
 * Tre esclusioni, tutte con un motivo misurato:
 *  - il saluto: "Ciao" non ha risposta da cercare, e i dati veri mostrano 5
 *    risposte con somiglianza 0 che sono esattamente saluti. Trattarli come
 *    lacune creerebbe la riga "ciao" in cima alla coda;
 *  - la risposta fondata: la base la copriva, non manca nulla;
 *  - il messaggio che non chiede niente (vedi `sembraUnaDomanda`).
 */
export function eUnaLacuna(v: ValutazioneLacuna): boolean {
  if (v.soloSaluto) return false
  if (v.fondata) return false
  return sembraUnaDomanda(v.domanda)
}

export interface RegistraLacunaArgs {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string | null
  channel: string | null
  knowledgeBaseId: string | null
  domanda: string
  /** Cosa ha risposto l'assistente senza appoggiarsi alla base. */
  rispostaIa: string | null
  similarity: number | null
  threshold: number | null
}

export type EsitoLacuna = "creata" | "ripetuta" | "ripetuta_dopo_risoluzione" | "errore"

/**
 * Registra la lacuna, oppure conta una ripetizione.
 *
 * Una domanda ripetuta NON crea una seconda riga: alza `occurrences`, cosi' la
 * pagina puo' ordinare per "quante volte ce l'hanno chiesto" invece di mostrare
 * dieci righe identiche.
 *
 * Se la lacuna era gia' stata risolta e la domanda torna, si conta a parte
 * (`seen_after_resolution`): vuol dire che la risposta inserita non sta
 * funzionando. Lo stato NON viene riaperto da qui, perche' una persona aveva
 * deciso e il sistema non scavalca quella decisione: la dichiara.
 */
export async function registraLacuna(args: RegistraLacunaArgs): Promise<EsitoLacuna> {
  const { supabase, propertyId } = args
  const domanda = args.domanda.trim().slice(0, MAX_DOMANDA)
  const chiave = normalizzaDomanda(domanda)
  if (!chiave) return "errore"

  const adesso = new Date().toISOString()

  const { data: esistente } = await supabase
    .from("knowledge_gaps")
    .select("id, occurrences, status, seen_after_resolution")
    .eq("property_id", propertyId)
    .eq("question_key", chiave)
    .maybeSingle()

  if (esistente) {
    const risolta = esistente.status !== "aperta"
    const { error } = await supabase
      .from("knowledge_gaps")
      .update({
        occurrences: (esistente.occurrences ?? 1) + 1,
        last_seen_at: adesso,
        updated_at: adesso,
        ...(risolta ? { seen_after_resolution: (esistente.seen_after_resolution ?? 0) + 1 } : {}),
      })
      .eq("id", esistente.id)
      .eq("property_id", propertyId)

    if (error) {
      console.log(`[v0] lacuna update error: ${error.message}`)
      return "errore"
    }
    return risolta ? "ripetuta_dopo_risoluzione" : "ripetuta"
  }

  const { error } = await supabase.from("knowledge_gaps").insert({
    property_id: propertyId,
    conversation_id: args.conversationId,
    channel: args.channel,
    knowledge_base_id: args.knowledgeBaseId,
    question: domanda,
    question_key: chiave,
    ai_answer: args.rispostaIa ? args.rispostaIa.slice(0, MAX_DOMANDA) : null,
    similarity: args.similarity,
    threshold: args.threshold,
    status: "aperta",
    first_seen_at: adesso,
    last_seen_at: adesso,
  })

  if (error) {
    // 23505: due messaggi con la stessa domanda arrivati insieme. L'indice
    // unico ha fatto il suo lavoro; qui si conta la ripetizione invece di
    // perdere il secondo passaggio.
    if ((error as { code?: string }).code === "23505") {
      const { data: riga } = await supabase
        .from("knowledge_gaps")
        .select("id, occurrences")
        .eq("property_id", propertyId)
        .eq("question_key", chiave)
        .maybeSingle()
      if (riga) {
        await supabase
          .from("knowledge_gaps")
          .update({ occurrences: (riga.occurrences ?? 1) + 1, last_seen_at: adesso, updated_at: adesso })
          .eq("id", riga.id)
          .eq("property_id", propertyId)
        return "ripetuta"
      }
    }
    console.log(`[v0] lacuna insert error: ${error.message}`)
    return "errore"
  }

  return "creata"
}

/**
 * Il testo della fonte che nasce da una lacuna approvata.
 *
 * Domanda e risposta insieme: la sola risposta ("La colazione e' dalle 7:30
 * alle 10:30") si recupera male, perche' la ricerca confronta la domanda
 * dell'ospite con il testo della fonte. Tenere la domanda dentro il testo e'
 * quello che rende utile l'anello.
 */
export function testoFonteDaLacuna(domanda: string, risposta: string): string {
  return [`Domanda: ${domanda.trim()}`, "", `Risposta: ${risposta.trim()}`].join("\n")
}

/** Titolo leggibile della fonte creata, per riconoscerla nell'elenco. */
export function titoloFonteDaLacuna(domanda: string): string {
  const pulita = domanda.trim().replace(/\s+/g, " ")
  const breve = pulita.length > 80 ? `${pulita.slice(0, 77)}...` : pulita
  return `Dall'esperienza: ${breve}`
}
