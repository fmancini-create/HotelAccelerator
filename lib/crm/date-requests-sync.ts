/**
 * Travaso: estrazioni della domanda -> richieste di date (pipeline CRM).
 *
 * Volutamente SENZA `server-only`: lo importano sia la rotta del cron sia lo
 * script di riallineamento. Il client Supabase arriva come parametro, come fa
 * già `lib/demand/run.ts`, così questo file non decide da solo con quali
 * credenziali scrivere.
 *
 * Perché esiste: `contact_date_requests` era una tabella LETTA
 * dall'interfaccia e mai scritta da nessuno (0 righe, nessun chiamante). Le
 * pagine mostravano quindi il vuoto, o — nella versione dimostrativa — numeri
 * inventati. I dati c'erano già in `conversation_extractions`: mancava solo chi
 * li portasse dove l'interfaccia guarda.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { traduciEstrazione, type EstrazioneDomanda, type RigaRichiesta } from "./date-requests"

export interface RapportoTravaso {
  /** Estrazioni esaminate. */
  esaminate: number
  /** Estrazioni che parlano di date, quindi traducibili. */
  traducibili: number
  /** Righe scritte adesso. */
  inserite: number
  /** Righe che l'indice univoco ha riconosciuto come già presenti. */
  giaPresenti: number
  /** Righe non scritte per un errore, con il motivo. */
  fallite: number
  errori: string[]
  /** Vero quando nulla è stato scritto perché richiesto esplicitamente. */
  provaSenzaScrivere: boolean
}

const PAGINA = 1000

/**
 * Legge tutte le estrazioni di una struttura.
 *
 * Si pagina sempre: Supabase tronca a 1000 righe anche chiedendone di più, e
 * una lettura troncata darebbe un travaso parziale con l'aria di essere
 * completo. L'ordinamento è per `id`, che è univoco: ordinare per un campo con
 * valori ripetuti (come `created_at`) può far saltare o ripetere righe fra una
 * pagina e l'altra.
 */
async function leggiEstrazioni(supabase: SupabaseClient, propertyId: string): Promise<EstrazioneDomanda[]> {
  const fuori: EstrazioneDomanda[] = []
  let da = 0
  for (;;) {
    const { data, error } = await supabase
      .from("conversation_extractions")
      .select("id, property_id, conversation_id, kind, method, payload")
      .eq("property_id", propertyId)
      .order("id", { ascending: true })
      .range(da, da + PAGINA - 1)
    if (error) throw new Error(`Lettura estrazioni: ${error.message}`)
    const blocco = (data ?? []) as unknown as EstrazioneDomanda[]
    fuori.push(...blocco)
    if (blocco.length < PAGINA) break
    da += PAGINA
  }
  return fuori
}

/**
 * Contatto collegato a ciascuna conversazione.
 *
 * Serve perché la pipeline mostri un nome e non solo delle date. Misurato: 196
 * delle 200 conversazioni hanno un `contact_id`; per le altre 4 la riga resta
 * senza contatto e la pagina lo dichiara, invece di attribuirla a caso.
 */
async function leggiContatti(
  supabase: SupabaseClient,
  conversationIds: string[],
): Promise<Map<string, string | null>> {
  const mappa = new Map<string, string | null>()
  const BLOCCO = 200
  for (let i = 0; i < conversationIds.length; i += BLOCCO) {
    const lotto = conversationIds.slice(i, i + BLOCCO)
    const { data, error } = await supabase.from("conversations").select("id, contact_id").in("id", lotto)
    if (error) throw new Error(`Lettura conversazioni: ${error.message}`)
    for (const r of data ?? []) mappa.set(r.id as string, (r.contact_id as string | null) ?? null)
  }
  return mappa
}

/**
 * Scrive una richiesta senza creare doppioni.
 *
 * L'unicità è garantita dall'indice `uq_cdr_external_ref` nel database, non da
 * un controllo "esiste già?" in codice: due travasi avviati insieme
 * supererebbero entrambi il controllo e scriverebbero due righe. Quindi si
 * TENTA e si interpreta la violazione 23505 come "già fatto", che è corretto
 * anche con più esecuzioni in parallelo.
 */
async function scrivi(supabase: SupabaseClient, riga: RigaRichiesta): Promise<"inserita" | "gia"> {
  const { error } = await supabase.from("contact_date_requests").insert(riga)
  if (!error) return "inserita"
  if (error.code === "23505") return "gia"
  throw new Error(error.message)
}

/**
 * Allinea la pipeline di una struttura alle estrazioni presenti.
 *
 * Idempotente: rieseguirla non produce doppioni (vedi `riferimentoStabile`).
 * Con `provaSenzaScrivere` legge e traduce senza toccare il database: serve a
 * vedere quante righe nascerebbero PRIMA di crearle. Una prova che scrive non è
 * una prova.
 */
export async function allineaRichiesteDate(
  supabase: SupabaseClient,
  propertyId: string,
  opzioni: { provaSenzaScrivere?: boolean } = {},
): Promise<RapportoTravaso> {
  const rapporto: RapportoTravaso = {
    esaminate: 0,
    traducibili: 0,
    inserite: 0,
    giaPresenti: 0,
    fallite: 0,
    errori: [],
    provaSenzaScrivere: opzioni.provaSenzaScrivere === true,
  }

  const estrazioni = await leggiEstrazioni(supabase, propertyId)
  rapporto.esaminate = estrazioni.length

  const idConversazioni = [...new Set(estrazioni.map((e) => e.conversation_id).filter((v): v is string => !!v))]
  const contatti = await leggiContatti(supabase, idConversazioni)

  for (const e of estrazioni) {
    const riga = traduciEstrazione(e, e.conversation_id ? contatti.get(e.conversation_id) ?? null : null)
    if (!riga) continue
    rapporto.traducibili++

    if (rapporto.provaSenzaScrivere) continue

    try {
      const esito = await scrivi(supabase, riga)
      if (esito === "inserita") rapporto.inserite++
      else rapporto.giaPresenti++
    } catch (err) {
      rapporto.fallite++
      const msg = err instanceof Error ? err.message : String(err)
      // Un solo messaggio per tipo: lo stesso errore mille volte non informa.
      if (!rapporto.errori.includes(msg)) rapporto.errori.push(msg)
    }
  }

  return rapporto
}
