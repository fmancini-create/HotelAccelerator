import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { risolviScadenzaBlocco } from "@/lib/inbox/lock-settings"

/**
 * Un messaggio, un operatore: presa in carico, bozze condivise e cronologia.
 *
 * Il problema che risolve: due persone al ricevimento aprono la stessa richiesta
 * e rispondono entrambe. L'ospite riceve due risposte, magari in contrasto, e
 * nessuno dei due sa di aver duplicato il lavoro.
 *
 * Due regole tengono insieme tutto il resto:
 *
 *  1. Il blocco scatta quando si SCRIVE, non quando si apre. Se bastasse
 *     aprire, un operatore che scorre la casella la bloccherebbe tutta senza
 *     accorgersene.
 *  2. Il blocco vive quanto la lavorazione, la bozza no. Finche' uno scrive gli
 *     altri vedono "in lavorazione"; quando smette senza inviare il testo resta
 *     come bozza CONDIVISA che chiunque puo' riprendere. Cosi' "offuscato per
 *     gli altri" e "gestibile anche dagli altri" non si contraddicono.
 */

// Il bersaglio (tipo + chiave) e la sua validazione vivono in un modulo
// condiviso col pannello: una sola definizione per server e browser.
export type { TipoBersaglio, Bersaglio } from "@/lib/inbox/target"
import type { Bersaglio } from "@/lib/inbox/target"

/** Chi tiene il blocco. `key` e' l'identita' di confronto (esiste sempre),
 *  `adminUserId` e' il collegamento all'operatore vero quando c'e': un super
 *  amministratore non ha una scheda operatore ma deve poter lavorare. */
export interface Titolare {
  key: string
  adminUserId: string | null
  label: string
}

export interface StatoBlocco {
  bersaglio: Bersaglio
  titolare: Titolare
  startedAt: string
  lastBeatAt: string
  /** Vero se il titolare e' chi sta guardando: il pannello non deve offuscare
   *  a un operatore il messaggio che sta scrivendo lui stesso. */
  mio: boolean
}

export type EsitoPresa =
  | { esito: "preso"; blocco: StatoBlocco }
  | { esito: "rinnovato"; blocco: StatoBlocco }
  | { esito: "occupato"; blocco: StatoBlocco; scadeTra: number }

export type AzioneCronologia =
  | "lock_acquired"
  | "lock_released"
  | "lock_expired"
  | "lock_taken_over"
  | "draft_saved"
  | "draft_discarded"
  | "transfer_requested"
  | "transfer_granted"
  | "transfer_denied"
  | "transfer_cancelled"
  | "message_sent"

/** Registra un fatto nella cronologia. In sola aggiunta: e' la traccia
 *  richiesta, quindi non deve poter essere corretta a posteriori. */
export async function registraAttivita(params: {
  propertyId: string
  bersaglio: Bersaglio
  titolare: Titolare | null
  azione: AzioneCronologia
  dettagli?: Record<string, unknown>
}): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from("conversation_activity_log").insert({
    property_id: params.propertyId,
    target_kind: params.bersaglio.kind,
    target_key: params.bersaglio.key,
    user_id: params.titolare?.adminUserId ?? null,
    user_key: params.titolare?.key ?? null,
    user_label: params.titolare?.label ?? null,
    action: params.azione,
    details: params.dettagli ?? {},
  })
  // La cronologia non deve far fallire l'azione che sta tracciando: se il
  // salvataggio della traccia rompesse l'invio, l'ospite resterebbe senza
  // risposta per un problema di registro.
  if (error) console.error("[v0] cronologia inbox: riga non scritta:", error.message)
}

function componiStato(riga: any, titolareCorrente: Titolare | null): StatoBlocco {
  return {
    bersaglio: { kind: riga.target_kind, key: riga.target_key },
    titolare: {
      key: riga.holder_key,
      adminUserId: riga.user_id ?? null,
      label: riga.holder_label ?? "Operatore",
    },
    startedAt: riga.started_at,
    lastBeatAt: riga.last_beat_at,
    mio: titolareCorrente ? riga.holder_key === titolareCorrente.key : false,
  }
}

/** Il blocco e' scaduto? Dipende dalla scadenza del TITOLARE, non di chi
 *  guarda: e' il suo tempo di inattivita' che stiamo misurando. */
async function scadutoDa(propertyId: string, riga: any): Promise<{ scaduto: boolean; scadeTra: number }> {
  const { secondi } = await risolviScadenzaBlocco(propertyId, riga.user_id ?? null)
  const trascorsi = (Date.now() - new Date(riga.last_beat_at).getTime()) / 1000
  return { scaduto: trascorsi > secondi, scadeTra: Math.max(0, Math.round(secondi - trascorsi)) }
}

/**
 * Prende in carico un messaggio, oppure dice chi ce l'ha.
 *
 * La garanzia "un solo operatore" viene dal vincolo di unicita' nel database,
 * non da un controllo in codice: due richieste simultanee supererebbero entrambe
 * un "esiste gia'?" prima che l'altra abbia scritto, e finirebbero per lavorare
 * lo stesso messaggio. Qui la seconda riceve un errore di violazione e allora,
 * solo allora, guarda di chi e'.
 */
export async function prendiBlocco(params: {
  propertyId: string
  bersaglio: Bersaglio
  titolare: Titolare
}): Promise<EsitoPresa> {
  const supabase = createServiceClient()
  const { propertyId, bersaglio, titolare } = params
  const adesso = new Date().toISOString()

  const { data: inserita, error: erroreInserimento } = await supabase
    .from("conversation_locks")
    .insert({
      property_id: propertyId,
      target_kind: bersaglio.kind,
      target_key: bersaglio.key,
      user_id: titolare.adminUserId,
      holder_key: titolare.key,
      holder_label: titolare.label,
      started_at: adesso,
      last_beat_at: adesso,
    })
    .select()
    .single()

  if (!erroreInserimento && inserita) {
    await registraAttivita({ propertyId, bersaglio, titolare, azione: "lock_acquired" })
    return { esito: "preso", blocco: componiStato(inserita, titolare) }
  }

  // 23505 = violazione di unicita': qualcuno lo tiene gia'. Non e' un guasto,
  // e' esattamente il caso che il vincolo esiste per intercettare, quindi NON
  // va risollevato come errore.
  if (erroreInserimento && (erroreInserimento as any).code !== "23505") {
    throw new Error(erroreInserimento.message)
  }

  const { data: esistente, error: erroreLettura } = await supabase
    .from("conversation_locks")
    .select("*")
    .eq("property_id", propertyId)
    .eq("target_kind", bersaglio.kind)
    .eq("target_key", bersaglio.key)
    .single()

  if (erroreLettura || !esistente) {
    // Caso di corsa opposto: il blocco e' stato rilasciato fra l'inserimento
    // fallito e questa lettura. Riprovare una volta e' corretto.
    if (!erroreLettura) throw new Error("Blocco non leggibile")
    throw new Error(erroreLettura.message)
  }

  // E' mio: rinnovo il battito. Succede a ogni carattere digitato.
  if (esistente.holder_key === titolare.key) {
    await supabase.from("conversation_locks").update({ last_beat_at: adesso }).eq("id", esistente.id)
    return { esito: "rinnovato", blocco: componiStato({ ...esistente, last_beat_at: adesso }, titolare) }
  }

  const { scaduto, scadeTra } = await scadutoDa(propertyId, esistente)

  if (!scaduto) {
    return { esito: "occupato", blocco: componiStato(esistente, titolare), scadeTra }
  }

  // Scaduto: lo rilevo. La condizione su `last_beat_at` e' cio' che rende
  // sicura la corsa fra due operatori che se ne accorgono nello stesso istante:
  // il primo cambia il valore, il secondo non trova piu' la riga da aggiornare
  // e riceve zero righe.
  const { data: rilevata } = await supabase
    .from("conversation_locks")
    .update({
      user_id: titolare.adminUserId,
      holder_key: titolare.key,
      holder_label: titolare.label,
      started_at: adesso,
      last_beat_at: adesso,
    })
    .eq("id", esistente.id)
    .eq("last_beat_at", esistente.last_beat_at)
    .select()

  if (!rilevata || rilevata.length === 0) {
    // Ha vinto un altro: rileggo per dire il nome giusto.
    const { data: aggiornata } = await supabase
      .from("conversation_locks")
      .select("*")
      .eq("id", esistente.id)
      .maybeSingle()
    const riga = aggiornata ?? esistente
    const misura = await scadutoDa(propertyId, riga)
    return { esito: "occupato", blocco: componiStato(riga, titolare), scadeTra: misura.scadeTra }
  }

  await registraAttivita({
    propertyId,
    bersaglio,
    titolare,
    azione: "lock_expired",
    dettagli: { precedente: esistente.holder_label, precedenteKey: esistente.holder_key },
  })
  return { esito: "preso", blocco: componiStato(rilevata[0], titolare) }
}

/** Rilascia il blocco, ma solo se e' davvero il proprio: senza questa
 *  condizione un battito in ritardo potrebbe liberare il blocco di un collega
 *  che ha appena preso il messaggio. */
export async function rilasciaBlocco(params: {
  propertyId: string
  bersaglio: Bersaglio
  titolare: Titolare
  motivo?: AzioneCronologia
}): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("conversation_locks")
    .delete()
    .eq("property_id", params.propertyId)
    .eq("target_kind", params.bersaglio.kind)
    .eq("target_key", params.bersaglio.key)
    .eq("holder_key", params.titolare.key)
    .select()

  const rilasciato = Boolean(data && data.length > 0)
  if (rilasciato) {
    await registraAttivita({
      propertyId: params.propertyId,
      bersaglio: params.bersaglio,
      titolare: params.titolare,
      azione: params.motivo ?? "lock_released",
    })
  }
  return rilasciato
}

/**
 * Blocchi attivi di una struttura, gia' ripuliti di quelli scaduti.
 *
 * La pulizia avviene in lettura e non con un lavoro periodico perche' la
 * scadenza dipende dal titolare: un processo notturno dovrebbe ricalcolare le
 * impostazioni di ognuno, mentre qui la domanda arriva solo per i messaggi che
 * qualcuno sta effettivamente guardando.
 */
export async function leggiBlocchiAttivi(
  propertyId: string,
  titolareCorrente: Titolare | null,
): Promise<StatoBlocco[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("conversation_locks").select("*").eq("property_id", propertyId)

  if (error) {
    console.error("[v0] blocchi inbox: lettura fallita:", error.message)
    return []
  }

  const attivi: StatoBlocco[] = []
  const daRimuovere: string[] = []

  for (const riga of data ?? []) {
    const { scaduto } = await scadutoDa(propertyId, riga)
    if (scaduto) {
      daRimuovere.push(riga.id)
      continue
    }
    attivi.push(componiStato(riga, titolareCorrente))
  }

  if (daRimuovere.length > 0) {
    await supabase.from("conversation_locks").delete().in("id", daRimuovere)
  }

  return attivi
}

// ---------------------------------------------------------------------------
// Bozze condivise
// ---------------------------------------------------------------------------

export interface Bozza {
  bersaglio: Bersaglio
  body: string
  subject: string | null
  createdByLabel: string | null
  updatedByLabel: string | null
  updatedAt: string
}

/** Una bozza come compare nella vista "Bozze": oltre al testo porta il contesto
 *  del messaggio a cui appartiene, altrimenti la riga non sarebbe identificabile. */
export interface BozzaElencata extends Bozza {
  oggetto: string | null
  interlocutore: string | null
}

function componiBozza(riga: any): Bozza {
  return {
    bersaglio: { kind: riga.target_kind, key: riga.target_key },
    body: riga.body ?? "",
    subject: riga.subject ?? null,
    createdByLabel: riga.created_by_label ?? null,
    updatedByLabel: riga.updated_by_label ?? null,
    updatedAt: riga.updated_at,
  }
}

/**
 * Salva la bozza condivisa. Una sola per messaggio, per scelta: due bozze
 * rivali sullo stesso ospite significherebbero che una delle due sparisce
 * senza dirlo a chi l'ha scritta.
 */
export async function salvaBozza(params: {
  propertyId: string
  bersaglio: Bersaglio
  titolare: Titolare
  body: string
  subject?: string | null
}): Promise<Bozza | null> {
  const supabase = createServiceClient()
  const { propertyId, bersaglio, titolare } = params

  // Bozza svuotata: si cancella, altrimenti l'elenco "Bozze" si riempirebbe di
  // righe vuote che nessuno ha scritto.
  if (params.body.trim().length === 0 && !params.subject) {
    const { data } = await supabase
      .from("conversation_drafts")
      .delete()
      .eq("property_id", propertyId)
      .eq("target_kind", bersaglio.kind)
      .eq("target_key", bersaglio.key)
      .select()
    if (data && data.length > 0) {
      await registraAttivita({ propertyId, bersaglio, titolare, azione: "draft_discarded" })
    }
    return null
  }

  const { data: precedente } = await supabase
    .from("conversation_drafts")
    .select("id, created_by, created_by_label")
    .eq("property_id", propertyId)
    .eq("target_kind", bersaglio.kind)
    .eq("target_key", bersaglio.key)
    .maybeSingle()

  const { data, error } = await supabase
    .from("conversation_drafts")
    .upsert(
      {
        property_id: propertyId,
        target_kind: bersaglio.kind,
        target_key: bersaglio.key,
        body: params.body,
        subject: params.subject ?? null,
        // Il primo autore non va sovrascritto: "Bozza di Mario, modificata da
        // Anna" ha senso solo se Mario resta registrato.
        created_by: precedente?.created_by ?? titolare.adminUserId,
        created_by_label: precedente?.created_by_label ?? titolare.label,
        updated_by: titolare.adminUserId,
        updated_by_key: titolare.key,
        updated_by_label: titolare.label,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,target_kind,target_key" },
    )
    .select()
    .single()

  if (error) throw new Error(error.message)

  await registraAttivita({
    propertyId,
    bersaglio,
    titolare,
    azione: "draft_saved",
    dettagli: { caratteri: params.body.length },
  })
  return componiBozza(data)
}

export async function leggiBozza(propertyId: string, bersaglio: Bersaglio): Promise<Bozza | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("conversation_drafts")
    .select("*")
    .eq("property_id", propertyId)
    .eq("target_kind", bersaglio.kind)
    .eq("target_key", bersaglio.key)
    .maybeSingle()
  return data ? componiBozza(data) : null
}

export async function leggiBozzeStruttura(propertyId: string): Promise<BozzaElencata[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversation_drafts")
    .select("*")
    .eq("property_id", propertyId)
    .order("updated_at", { ascending: false })
  if (error) {
    console.error("[v0] bozze inbox: lettura fallita:", error.message)
    return []
  }
  const bozze: Bozza[] = (data ?? []).map(componiBozza)
  if (bozze.length === 0) return []

  // Senza oggetto e interlocutore la riga direbbe solo "bozza di Giulia", e
  // l'operatore non saprebbe a quale messaggio appartiene: e' l'informazione
  // che rende la vista utilizzabile invece che curiosa.
  const idConversazioni = bozze.filter((b) => b.bersaglio.kind === "conversation").map((b) => b.bersaglio.key)

  const contesto = new Map<string, { oggetto: string | null; interlocutore: string | null }>()
  if (idConversazioni.length > 0) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, subject, contact_name, contact_email")
      .eq("property_id", propertyId)
      .in("id", idConversazioni)
    for (const c of conv ?? []) {
      contesto.set(String(c.id), {
        oggetto: c.subject ?? null,
        interlocutore: c.contact_name ?? c.contact_email ?? null,
      })
    }
  }

  return bozze.map((b) => ({
    ...b,
    oggetto: contesto.get(b.bersaglio.key)?.oggetto ?? null,
    interlocutore: contesto.get(b.bersaglio.key)?.interlocutore ?? null,
  }))
}

/** Cancella la bozza dopo un invio riuscito: tenerla darebbe l'impressione che
 *  ci sia ancora qualcosa da mandare. */
export async function cancellaBozza(propertyId: string, bersaglio: Bersaglio): Promise<void> {
  const supabase = createServiceClient()
  await supabase
    .from("conversation_drafts")
    .delete()
    .eq("property_id", propertyId)
    .eq("target_kind", bersaglio.kind)
    .eq("target_key", bersaglio.key)
}

// ---------------------------------------------------------------------------
// Cronologia
// ---------------------------------------------------------------------------

export async function leggiCronologia(
  propertyId: string,
  bersaglio: Bersaglio,
  limite = 100,
): Promise<
  Array<{
    id: string
    azione: string
    autore: string | null
    dettagli: Record<string, unknown>
    quando: string
  }>
> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("conversation_activity_log")
    .select("id, action, user_label, details, created_at")
    .eq("property_id", propertyId)
    .eq("target_kind", bersaglio.kind)
    .eq("target_key", bersaglio.key)
    .order("created_at", { ascending: false })
    .limit(limite)

  if (error) throw new Error(error.message)

  return (data ?? []).map((r: any) => ({
    id: r.id,
    azione: r.action,
    autore: r.user_label ?? null,
    dettagli: r.details ?? {},
    quando: r.created_at,
  }))
}
