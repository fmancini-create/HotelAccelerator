import "server-only"
import { createServiceClient } from "@/lib/supabase/server"
import { type Bersaglio, type Titolare, registraAttivita, rilasciaBlocco } from "@/lib/inbox/collaboration"

/**
 * Richiesta di passaggio di una conversazione.
 *
 * Perche' una richiesta e non uno scavalco: se chiunque potesse strappare il
 * messaggio a chi ci sta lavorando, il blocco non proteggerebbe piu' niente e
 * torneremmo alle due risposte contemporanee. Ma senza via d'uscita il blocco
 * diventerebbe un vicolo cieco quando il collega e' in ferie.
 *
 * Percio' chi chiede si rivolge a qualcuno che ha il potere di concedere:
 *  - al collega che tiene il messaggio, SE ha il permesso di trasferire;
 *  - all'amministratore, altrimenti.
 * Mandare la richiesta a chi non puo' concederla sarebbe un vicolo cieco
 * travestito da funzione.
 */

export interface PermessoTrasferimento {
  puo: boolean
  /** Da dove viene la decisione: serve a spiegarla nel pannello. */
  origine: "amministratore" | "operatore" | "gruppo" | "predefinito"
}

/**
 * Puo' trasferire le conversazioni?
 *
 * Ordine: amministratore -> decisione esplicita sull'operatore -> gruppi.
 * Sull'operatore il valore nullo significa "segui i gruppi": serve distinguere
 * "non impostato" da "negato", altrimenti i gruppi non conterebbero mai nulla.
 */
export async function puoTrasferire(params: {
  adminUserId: string | null
  isAdmin: boolean
}): Promise<PermessoTrasferimento> {
  // Un amministratore assegna e riassegna per definizione: se dovesse chiedere
  // il permesso a se stesso non potrebbe piu' sbloccare nessuno.
  if (params.isAdmin) return { puo: true, origine: "amministratore" }
  if (!params.adminUserId) return { puo: false, origine: "predefinito" }

  const supabase = createServiceClient()

  const { data: operatore } = await supabase
    .from("admin_users")
    .select("can_transfer_conversations")
    .eq("id", params.adminUserId)
    .maybeSingle()

  if (operatore && operatore.can_transfer_conversations !== null) {
    return { puo: operatore.can_transfer_conversations === true, origine: "operatore" }
  }

  const { data: appartenenze } = await supabase
    .from("user_group_members")
    .select("group_id, user_groups!inner(can_transfer_conversations)")
    .eq("user_id", params.adminUserId)

  const concessoDaUnGruppo = (appartenenze ?? []).some(
    (a: any) => a.user_groups?.can_transfer_conversations === true,
  )
  if (concessoDaUnGruppo) return { puo: true, origine: "gruppo" }

  return { puo: false, origine: "predefinito" }
}

export interface RichiestaPassaggio {
  id: string
  bersaglio: Bersaglio
  richiedente: string
  titolare: string | null
  destinatario: "holder" | "admin"
  stato: string
  motivo: string | null
  creataIl: string
}

function componi(riga: any): RichiestaPassaggio {
  return {
    id: riga.id,
    bersaglio: { kind: riga.target_kind, key: riga.target_key },
    richiedente: riga.requested_by_label ?? "Operatore",
    titolare: riga.holder_label ?? null,
    destinatario: riga.addressed_to,
    stato: riga.status,
    motivo: riga.reason ?? null,
    creataIl: riga.created_at,
  }
}

/**
 * Apre una richiesta di passaggio. Il destinatario non lo decide chi chiede: lo
 * decide il permesso di chi tiene il messaggio.
 */
export async function chiediPassaggio(params: {
  propertyId: string
  bersaglio: Bersaglio
  richiedente: Titolare
  motivo?: string | null
}): Promise<{ richiesta: RichiestaPassaggio | null; destinatario: "holder" | "admin"; giaAperta: boolean }> {
  const supabase = createServiceClient()
  const { propertyId, bersaglio, richiedente } = params

  const { data: blocco } = await supabase
    .from("conversation_locks")
    .select("user_id, holder_key, holder_label")
    .eq("property_id", propertyId)
    .eq("target_kind", bersaglio.kind)
    .eq("target_key", bersaglio.key)
    .maybeSingle()

  const permessoTitolare = await puoTrasferire({
    adminUserId: blocco?.user_id ?? null,
    isAdmin: false,
  })
  const destinatario: "holder" | "admin" = permessoTitolare.puo ? "holder" : "admin"

  const { data, error } = await supabase
    .from("conversation_transfer_requests")
    .insert({
      property_id: propertyId,
      target_kind: bersaglio.kind,
      target_key: bersaglio.key,
      requested_by: richiedente.adminUserId,
      requested_by_key: richiedente.key,
      requested_by_label: richiedente.label,
      holder_id: blocco?.user_id ?? null,
      holder_key: blocco?.holder_key ?? null,
      holder_label: blocco?.holder_label ?? null,
      addressed_to: destinatario,
      reason: params.motivo ?? null,
    })
    .select()
    .single()

  // 23505: una richiesta aperta esiste gia' per questo messaggio e questo
  // richiedente. Non e' un guasto: e' il freno contro la raffica di richieste
  // identiche di chi ripreme il pulsante.
  if (error && (error as any).code === "23505") {
    return { richiesta: null, destinatario, giaAperta: true }
  }
  if (error) throw new Error(error.message)

  await registraAttivita({
    propertyId,
    bersaglio,
    titolare: richiedente,
    azione: "transfer_requested",
    dettagli: { destinatario, titolare: blocco?.holder_label ?? null, motivo: params.motivo ?? null },
  })

  return { richiesta: componi(data), destinatario, giaAperta: false }
}

/**
 * Accetta o rifiuta. Chi puo' rispondere: il titolare a cui e' rivolta, oppure
 * un amministratore (che deve poter sbloccare anche le richieste rivolte a un
 * collega assente: e' il caso per cui la funzione esiste).
 */
export async function rispondiPassaggio(params: {
  propertyId: string
  richiestaId: string
  chiRisponde: Titolare
  isAdmin: boolean
  concedi: boolean
}): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = createServiceClient()

  const { data: richiesta } = await supabase
    .from("conversation_transfer_requests")
    .select("*")
    .eq("id", params.richiestaId)
    .eq("property_id", params.propertyId)
    .maybeSingle()

  if (!richiesta) return { ok: false, motivo: "Richiesta non trovata" }
  if (richiesta.status !== "pending") return { ok: false, motivo: "Richiesta già chiusa" }

  const eIlTitolare = richiesta.holder_key === params.chiRisponde.key
  if (!params.isAdmin && !eIlTitolare) {
    return { ok: false, motivo: "Solo chi ha in carico il messaggio o un amministratore può rispondere" }
  }

  const bersaglio: Bersaglio = { kind: richiesta.target_kind, key: richiesta.target_key }

  const { data: aggiornata } = await supabase
    .from("conversation_transfer_requests")
    .update({
      status: params.concedi ? "granted" : "denied",
      resolved_by: params.chiRisponde.adminUserId,
      resolved_by_label: params.chiRisponde.label,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", params.richiestaId)
    // Solo se e' ancora aperta: due risposte simultanee non devono contarsi due
    // volte, e la seconda deve accorgersi di essere arrivata tardi.
    .eq("status", "pending")
    .select()

  if (!aggiornata || aggiornata.length === 0) {
    return { ok: false, motivo: "Richiesta già chiusa" }
  }

  if (params.concedi) {
    // Concedere significa liberare il messaggio, non assegnarlo d'ufficio a chi
    // ha chiesto: sara' lui a prenderlo scrivendo, con le stesse regole di
    // tutti. Assegnarglielo qui creerebbe un blocco che nessuno sta usando.
    const titolarePrecedente: Titolare = {
      key: richiesta.holder_key ?? params.chiRisponde.key,
      adminUserId: richiesta.holder_id ?? null,
      label: richiesta.holder_label ?? params.chiRisponde.label,
    }
    await rilasciaBlocco({
      propertyId: params.propertyId,
      bersaglio,
      titolare: titolarePrecedente,
      motivo: "lock_taken_over",
    })
  }

  await registraAttivita({
    propertyId: params.propertyId,
    bersaglio,
    titolare: params.chiRisponde,
    azione: params.concedi ? "transfer_granted" : "transfer_denied",
    dettagli: { richiedente: richiesta.requested_by_label, richiestaId: params.richiestaId },
  })

  return { ok: true }
}

/** Richieste che riguardano chi sta guardando: quelle rivolte a lui come
 *  titolare, e tutte quelle rivolte all'amministratore se lo e'. */
export async function richiestePerMe(params: {
  propertyId: string
  titolare: Titolare
  isAdmin: boolean
}): Promise<RichiestaPassaggio[]> {
  const supabase = createServiceClient()
  let query = supabase
    .from("conversation_transfer_requests")
    .select("*")
    .eq("property_id", params.propertyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (!params.isAdmin) {
    query = query.eq("addressed_to", "holder").eq("holder_key", params.titolare.key)
  }

  const { data, error } = await query
  if (error) {
    console.error("[v0] richieste passaggio: lettura fallita:", error.message)
    return []
  }
  return (data ?? []).map(componi)
}

/** Richieste aperte create da chi guarda: serve a mostrargli "richiesta
 *  inviata, in attesa" invece di lasciarlo premere di nuovo. */
export async function mieRichiesteAperte(propertyId: string, richiedenteKey: string): Promise<RichiestaPassaggio[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("conversation_transfer_requests")
    .select("*")
    .eq("property_id", propertyId)
    .eq("requested_by_key", richiedenteKey)
    .eq("status", "pending")
  return (data ?? []).map(componi)
}
