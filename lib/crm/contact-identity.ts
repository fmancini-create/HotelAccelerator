import type { SupabaseClient } from "@supabase/supabase-js"
import { phoneMatchKey } from "@/lib/telephony/threecx-client"

/**
 * Riconoscimento di chi scrive, a partire dal numero.
 *
 * Il centralino 3CX riconosce gia' i chiamanti confrontando le CIFRE
 * (`contacts.phone_digits`, colonna generata dal database) con le ultime 9
 * cifre del numero in arrivo. WhatsApp non usava quel meccanismo: cercava
 * l'uguaglianza esatta fra il numero del webhook (solo cifre, `393358046836`)
 * e `contacts.phone`, che in rubrica e' scritto a mano (`+39 335 8046836`).
 * Due formati della stessa utenza non sono la stessa stringa, quindi
 * l'anagrafica non veniva mai trovata e ne nasceva una nuova a ogni numero.
 *
 * Qui si riusa la funzione del centralino invece di scriverne una seconda:
 * due modi diversi di riconoscere la stessa persona finirebbero per divergere.
 */

export interface AnagraficaTrovata {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  whatsapp_id: string | null
  source: string | null
}

const CAMPI = "id, name, email, phone, whatsapp_id, source"

function valorizzato(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== ""
}

/**
 * Cerca l'anagrafica di un numero, in qualunque formato sia scritta in rubrica.
 *
 * Restituisce `null` quando il numero non e' riconoscibile (troppo corto) o non
 * risulta in rubrica: e' un esito valido, non un errore.
 */
export async function trovaCandidatiPerNumero(
  supabase: SupabaseClient,
  propertyId: string,
  numero: string,
): Promise<AnagraficaTrovata[]> {
  const chiave = phoneMatchKey(numero)
  if (!chiave) return []

  const { data, error } = await supabase
    .from("contacts")
    .select(CAMPI)
    .eq("property_id", propertyId)
    .like("phone_digits", `%${chiave}%`)
    .limit(10)

  if (error || !data) return []
  return data as unknown as AnagraficaTrovata[]
}

/**
 * Sceglie fra piu' candidati: vince la scheda curata da una persona sopra quella
 * creata dal canale, altrimenti il doppione automatico continuerebbe a coprire
 * la scheda vera.
 *
 * Scegliere non vuol dire nascondere: quando i candidati curati sono piu' di uno
 * la scelta e' un'ipotesi, e chi la fa deve dichiararla (vedi `segnalazione`).
 */
export function scegliAnagrafica(candidati: AnagraficaTrovata[]): AnagraficaTrovata | null {
  if (candidati.length === 0) return null
  return candidati.find((c) => c.source !== "whatsapp") ?? candidati[0]
}

export async function trovaAnagraficaPerNumero(
  supabase: SupabaseClient,
  propertyId: string,
  numero: string,
): Promise<AnagraficaTrovata | null> {
  return scegliAnagrafica(await trovaCandidatiPerNumero(supabase, propertyId, numero))
}

/**
 * Cerca un'anagrafica per email, escludendone una.
 *
 * Serve come PONTE: oggi in questo CRM 860 anagrafiche su 863 hanno l'email e
 * solo 2 hanno il numero (misurato), quindi il riconoscimento dal numero non
 * puo' trovare nessuno finche' i numeri non ci sono. L'email dichiarata in chat
 * e' l'unico dato che collega la conversazione alla scheda esistente; da quel
 * momento il numero viene salvato e il riconoscimento funziona da solo.
 */
export async function trovaCandidatiPerEmail(
  supabase: SupabaseClient,
  propertyId: string,
  email: string,
  escludiId?: string,
): Promise<AnagraficaTrovata[]> {
  const pulita = String(email || "").trim()
  // Le email vuote in rubrica sono stringhe `""`, non NULL: senza questo
  // controllo `ilike` su stringa vuota aggancerebbe centinaia di schede.
  if (!valorizzato(pulita)) return []

  let query = supabase
    .from("contacts")
    .select(CAMPI)
    .eq("property_id", propertyId)
    .ilike("email", pulita)
    .limit(5)

  if (escludiId) query = query.neq("id", escludiId)

  const { data, error } = await query
  if (error || !data) return []
  return data as unknown as AnagraficaTrovata[]
}

export async function trovaAnagraficaPerEmail(
  supabase: SupabaseClient,
  propertyId: string,
  email: string,
  escludiId?: string,
): Promise<AnagraficaTrovata | null> {
  return scegliAnagrafica(await trovaCandidatiPerEmail(supabase, propertyId, email, escludiId))
}

/**
 * Segnalazione all'operatore su cosa il sistema ha fatto (o non ha osato fare)
 * con l'anagrafica.
 *
 * Due casi, entrambi da mostrare:
 *  - `ambigua`: piu' schede curate sono compatibili con chi scrive (in questo CRM
 *    ci sono quattro "Filippo Mancini" con email diverse). Il sistema NON unisce
 *    di sua iniziativa: un'anagrafica fusa male e' peggio di due separate.
 *  - `collegata`: il sistema ha agganciato la conversazione a una scheda esistente
 *    e le ha salvato il numero. E' una modifica al CRM decisa da una macchina,
 *    quindi deve restare visibile e non silenziosa.
 */
export type TipoSegnalazione = "ambigua" | "collegata"

export interface SchedaCandidata {
  id: string
  nome: string | null
  email: string | null
}

export interface Segnalazione {
  tipo: TipoSegnalazione
  /** Frase pronta, cosi' l'elenco non deve ricomporla. */
  testo: string
  candidate?: SchedaCandidata[]
  anagrafica_id?: string
  numero_salvato?: boolean
  rilevata_il: string
}

function scheda(c: AnagraficaTrovata): SchedaCandidata {
  return { id: c.id, nome: valorizzato(c.name) ? (c.name as string).trim() : null, email: c.email }
}

/**
 * Decide se i candidati sono davvero ambigui.
 *
 * Le schede create dal canale non contano: sono i doppioni che il riconoscimento
 * deve superare, non alternative fra cui scegliere. Segnalare quelle vorrebbe
 * dire un badge su ogni conversazione, e un avviso che compare sempre non viene
 * piu' letto.
 */
export function segnalazioneAmbiguita(
  candidati: AnagraficaTrovata[],
  /** Completa la frase "N anagrafiche corrispondono ...": va passato articolato
   * ("al numero +39...", "all'email x@y"), non nudo. */
  comeTrovati: string,
): Segnalazione | null {
  const curate = candidati.filter((c) => c.source !== "whatsapp")
  if (curate.length < 2) return null

  const nomi = curate
    .map((c) => (valorizzato(c.name) ? (c.name as string).trim() : c.email))
    .filter(Boolean)
    .slice(0, 4)

  return {
    tipo: "ambigua",
    testo: `${curate.length} anagrafiche corrispondono a ${comeTrovati} (${nomi.join(", ")}): il collegamento non è stato deciso automaticamente.`,
    candidate: curate.map(scheda),
    rilevata_il: new Date().toISOString(),
  }
}

/**
 * Scrive la segnalazione sulla conversazione.
 *
 * Lettura-e-riscrittura come in `handoff.ts`: in `metadata` vive anche
 * `messaging_channel_id`, che governa l'accesso ai canali. Sovrascrivere
 * l'oggetto intero spegnerebbe quel filtro.
 *
 * Non riscrive se la segnalazione presente e' equivalente: un avviso che si
 * rigenera a ogni messaggio sposterebbe in continuazione la data e farebbe
 * sembrare nuovo un fatto vecchio.
 */
export async function registraSegnalazione(
  supabase: SupabaseClient,
  propertyId: string,
  conversationId: string,
  segnalazione: Segnalazione,
): Promise<boolean> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .eq("property_id", propertyId)
    .maybeSingle()

  const precedenti = (conv?.metadata as Record<string, unknown> | null) ?? {}
  const attuale = precedenti.crm_segnalazione as Segnalazione | undefined
  if (attuale && attuale.tipo === segnalazione.tipo && attuale.testo === segnalazione.testo) return false

  const { error } = await supabase
    .from("conversations")
    .update({
      metadata: { ...precedenti, crm_segnalazione: segnalazione },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("property_id", propertyId)

  if (error) {
    console.log(`[v0] segnalazione anagrafica non registrata: ${error.message}`)
    return false
  }
  return true
}

export interface EsitoUnione {
  collegata: boolean
  anagraficaId?: string
  nome?: string | null
  numeroSalvato?: boolean
  motivo?: string
}

/**
 * Collega la conversazione all'anagrafica esistente e le salva il numero.
 *
 * Il doppione creato dal canale NON viene cancellato: viene marcato come unito
 * in `custom_fields`. Cancellare una scheda per ripulire un elenco significa
 * perdere i messaggi che le sono agganciati.
 */
export async function collegaConversazioneAdAnagrafica(args: {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  anagrafica: AnagraficaTrovata
  numero: string
  anagraficaDaUnireId?: string | null
}): Promise<EsitoUnione> {
  const { supabase, propertyId, conversationId, anagrafica, numero, anagraficaDaUnireId } = args

  const nome = valorizzato(anagrafica.name) ? (anagrafica.name as string).trim() : null

  const { error: erroreConv } = await supabase
    .from("conversations")
    .update({
      contact_id: anagrafica.id,
      // In elenco compariva "FM", il nome del profilo WhatsApp: un'etichetta del
      // canale, non un dato inserito da voi. Il nome dell'anagrafica lo sostituisce.
      ...(nome ? { contact_name: nome, subject: `WhatsApp · ${nome}` } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("property_id", propertyId)

  if (erroreConv) return { collegata: false, motivo: erroreConv.message }

  // Il numero si scrive solo se il campo e' vuoto: non si sovrascrive un dato
  // inserito da una persona.
  let numeroSalvato = false
  const daScrivere: Record<string, string> = {}
  if (!valorizzato(anagrafica.phone)) daScrivere.phone = numero
  if (!valorizzato(anagrafica.whatsapp_id)) daScrivere.whatsapp_id = numero
  if (Object.keys(daScrivere).length > 0) {
    const { error } = await supabase
      .from("contacts")
      .update({ ...daScrivere, updated_at: new Date().toISOString() })
      .eq("id", anagrafica.id)
      .eq("property_id", propertyId)
    numeroSalvato = !error
  }

  if (anagraficaDaUnireId && anagraficaDaUnireId !== anagrafica.id) {
    const { data: doppione } = await supabase
      .from("contacts")
      .select("custom_fields")
      .eq("id", anagraficaDaUnireId)
      .maybeSingle()

    const precedenti =
      doppione && typeof doppione.custom_fields === "object" && doppione.custom_fields !== null
        ? (doppione.custom_fields as Record<string, unknown>)
        : {}

    await supabase
      .from("contacts")
      .update({
        // Si conservano le chiavi esistenti: `custom_fields` non e' nostro.
        custom_fields: {
          ...precedenti,
          unita_in_anagrafica_id: anagrafica.id,
          unita_il: new Date().toISOString(),
          unita_motivo: "email dichiarata in chat corrispondente a un'anagrafica esistente",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", anagraficaDaUnireId)
      .eq("property_id", propertyId)
  }

  return { collegata: true, anagraficaId: anagrafica.id, nome, numeroSalvato }
}

/**
 * Cosa il sistema sa gia' di chi scrive, da passare al modello.
 *
 * Senza questo, il bot chiedeva dati che aveva in mano: su WhatsApp chiedeva il
 * numero, che E' l'identita' del canale da cui sta leggendo il messaggio.
 */
export interface DatiNoti {
  nome: string | null
  email: string | null
  numero: string | null
  daAnagraficaEsistente: boolean
}

export function datiNotiDaAnagrafica(
  anagrafica: AnagraficaTrovata | null,
  numero: string | null,
  nomeProfilo?: string | null,
): DatiNoti {
  const nomeAnagrafica = anagrafica && valorizzato(anagrafica.name) ? (anagrafica.name as string).trim() : null
  // Il nome del profilo WhatsApp ("FM") non e' un nome noto: e' un'etichetta
  // scelta dal mittente. Vale come ripiego, mai come dato dell'anagrafica.
  const nome = nomeAnagrafica ?? (valorizzato(nomeProfilo) ? (nomeProfilo as string).trim() : null)
  return {
    nome,
    email: anagrafica && valorizzato(anagrafica.email) ? (anagrafica.email as string).trim() : null,
    numero: valorizzato(numero) ? (numero as string).trim() : null,
    daAnagraficaEsistente: Boolean(anagrafica && anagrafica.source !== "whatsapp"),
  }
}
