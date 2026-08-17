import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateReply, type ConversationTurn } from "./generate"
import { contactIsComplete, registerStaffHandoff } from "./handoff"
import { getBasesForChannel, type AiMode } from "./knowledge-bases"
import { eUnaLacuna, registraLacuna } from "./gaps"
import {
  trovaCandidatiPerNumero,
  trovaCandidatiPerEmail,
  scegliAnagrafica,
  segnalazioneAmbiguita,
  registraSegnalazione,
  datiNotiDaAnagrafica,
  type AnagraficaTrovata,
  type DatiNoti,
  type Segnalazione,
} from "@/lib/crm/contact-identity"

export type AiChannel = "telegram" | "whatsapp" | "email" | "chat"

export interface RunAutopilotArgs {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  /** Channel type, used only for message metadata/logging. */
  channel: AiChannel
  /** The specific messaging_channels row id — drives which knowledge bases are used. */
  channelId: string
  incomingText: string
  /**
   * Delivers the reply on the channel. Only invoked in `autopilot` mode.
   * Should return the provider message id when available (for idempotency).
   */
  send?: (text: string) => Promise<{ externalId?: string } | void>
  /**
   * Forza la modalita' ignorando quella della base primaria.
   *
   * Serve al caso "nessun operatore collegato": una bozza che aspetta
   * un'approvazione lascia l'ospite senza risposta finche' qualcuno non torna
   * alla scrivania. Chi chiama decide, perche' la regola di presenza non e'
   * competenza dell'assistente.
   *
   * `disabled` non viene mai scavalcato: se la struttura ha spento l'IA, la
   * vuole spenta anche di notte, e sovrascriverlo sarebbe disobbedire.
   */
  modeOverride?: Exclude<AiMode, "disabled">
}

export type AutopilotAction = "sent" | "draft" | "skipped"

export interface RunAutopilotResult {
  action: AutopilotAction
  reason?: string
  messageId?: string
  confidence?: number
}

/**
 * Single source of truth for AI replies across every channel.
 *
 * Behavior is driven by the knowledge bases linked to the channel. The primary
 * base (position 0) sets the mode:
 *   - mode 'disabled'  -> never acts
 *   - mode 'on_request'-> saves a DRAFT reply for an operator to approve
 *   - mode 'autopilot' -> sends the reply automatically (via `send`) and logs it
 *
 * When the knowledge base has no confident answer, it deliberately does
 * nothing (skipped) rather than inventing a reply.
 */
export async function runAutopilot(args: RunAutopilotArgs): Promise<RunAutopilotResult> {
  const { supabase, propertyId, conversationId, channel, channelId, incomingText, send } = args

  if (!incomingText?.trim()) {
    return { action: "skipped", reason: "empty_message" }
  }

  // Resolve the knowledge bases linked to this specific channel. The primary
  // base (position 0) drives behavior; retrieval spans all linked bases.
  const { primary, baseIds } = await getBasesForChannel(channelId)
  if (!primary || baseIds.length === 0) {
    return { action: "skipped", reason: "no_base_linked" }
  }
  // L'override si applica DOPO aver letto la base ma solo se la base non e'
  // spenta: l'ordine conta, perche' altrimenti una struttura che ha disattivato
  // l'assistente se lo vedrebbe riaccendere appena esce l'ultimo operatore.
  const mode = primary.mode === "disabled" ? "disabled" : (args.modeOverride ?? primary.mode)
  if (mode === "disabled") {
    return { action: "skipped", reason: "base_disabled" }
  }

  const history = await loadHistory(supabase, conversationId, propertyId)

  // Chi sta scrivendo, PRIMA di generare: il bot chiedeva nome, email e telefono
  // a un mittente che era gia' in rubrica, e su WhatsApp chiedeva il numero da
  // cui stava leggendo il messaggio.
  const identita = await caricaIdentita(supabase, propertyId, conversationId)

  // Il numero risponde a piu' schede curate: il sistema ne usa una per
  // rispondere, ma dichiara di non aver deciso il collegamento.
  if (identita.ambiguita) {
    await registraSegnalazione(supabase, propertyId, conversationId, identita.ambiguita)
  }

  const result = await generateReply(
    {
      baseIds,
      persona: primary.persona,
      language: primary.language,
      confidenceThreshold: primary.confidence_threshold,
      datiNoti: identita.datiNoti,
    },
    incomingText,
    history,
  )

  // L'esperienza torna nelle basi: quando la base NON copriva la domanda, la
  // richiesta viene messa in coda per l'approvazione di una persona. Si registra
  // qui, prima dei rami per modo, perche' la lacuna esiste allo stesso modo se
  // la risposta e' stata inviata, salvata come bozza o non data affatto.
  //
  // Mai bloccante: l'ospite sta aspettando una risposta e un problema nello
  // scrivere la lacuna non deve togliergliela.
  try {
    if (
      eUnaLacuna({
        soloSaluto: result.greetingOnly,
        fondata: result.grounded,
        domanda: incomingText,
      })
    ) {
      await registraLacuna({
        supabase,
        propertyId,
        conversationId,
        channel,
        knowledgeBaseId: primary.id,
        domanda: incomingText,
        rispostaIa: result.answer,
        similarity: result.confidence,
        threshold: primary.confidence_threshold,
      })
    }
  } catch (err) {
    console.log(`[v0] registrazione lacuna fallita: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!result.answer) {
    // No confident answer from the knowledge base. In autopilot mode we send a
    // brief courtesy/handoff message instead of staying silent, so the guest is
    // never left without a reply. In on_request mode we stay silent because an
    // operator already sees the conversation and will answer.
    if (mode === "autopilot" && send) {
      // This text must not claim the request was forwarded: in this branch no
      // handoff has been registered, so "ho inoltrato la richiesta" would be
      // false. It asks for the details that make a real handoff possible.
      // Il testo predefinito chiedeva sempre "nome, cognome, email e telefono",
      // anche a chi scriveva da un numero noto e con l'anagrafica in rubrica.
      // Si chiedono solo i dati che mancano davvero.
      const fallback = primary.fallback_message?.trim() || testoRipiego(identita.datiNoti)
      let externalId: string | undefined
      try {
        const sendResult = await send(fallback)
        externalId = sendResult?.externalId
      } catch (err) {
        console.log(`[v0] autopilot fallback send failed: ${err instanceof Error ? err.message : String(err)}`)
        return { action: "skipped", reason: "send_failed", confidence: result.confidence }
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({
          property_id: propertyId,
          conversation_id: conversationId,
          sender_type: "agent",
          content: fallback,
          content_type: "text",
          status: "sent",
          external_message_id: externalId ?? null,
          stored_at: new Date().toISOString(),
          metadata: {
            channel,
            ai_generated: true,
            ai_fallback: true,
            ai_confidence: result.confidence,
            ai_grounded: result.grounded,
            ai_reason: result.reason ?? null,
            ai_knowledge_base_id: primary.id,
          },
        })
        .select("id")
        .single()

      // The guest already received the message, so we never fail the request
      // here — but a silent insert error means the reply is invisible in the
      // operator inbox, which is exactly the bug we must never ship again.
      if (error) {
        console.log(`[v0] autopilot fallback log insert error: ${error.message}`)
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .eq("property_id", propertyId)

      return {
        action: "sent",
        messageId: data?.id,
        reason: `fallback:${result.reason ?? "no_answer"}`,
        confidence: result.confidence,
      }
    }
    return { action: "skipped", reason: result.reason ?? "no_answer", confidence: result.confidence }
  }

  // The guest asked for a human AND left usable contact details: register the
  // handoff BEFORE delivering, so by the time the reply says "la metto in
  // contatto con lo staff" a ManuBot task exists and the conversation is
  // flagged in the inbox. Registering after sending would leave a window where
  // the promise is already made and nothing backs it.
  // Un'email dichiarata in chat non prova l'identita': puo' appartenere a
  // un'altra persona. Il sistema propone il candidato, ma non modifica mai il
  // CRM senza conferma umana.
  let unioneMeta: Record<string, unknown> | undefined
  const emailDichiarata = result.contact?.email?.trim() || null
  if (emailDichiarata && identita.numero) {
    const candidati = await trovaCandidatiPerEmail(supabase, propertyId, emailDichiarata, identita.anagrafica?.id)
    const ambiguita = segnalazioneAmbiguita(candidati, `all'email ${emailDichiarata}`)

    if (ambiguita) {
      // Piu' schede curate con la stessa email: il sistema non sceglie. Unire a
      // caso e' peggio che lasciare separato, quindi decide una persona.
      await registraSegnalazione(supabase, propertyId, conversationId, ambiguita)
      unioneMeta = { crm_anagrafica_ambigua: true }
    } else {
      const esistente = scegliAnagrafica(candidati)
      if (esistente) {
        unioneMeta = { crm_anagrafica_da_confermare_id: esistente.id }
        await registraSegnalazione(supabase, propertyId, conversationId, {
          tipo: "da_confermare",
          testo: `L'email dichiarata corrisponde a ${esistente.name ?? esistente.email ?? "un'anagrafica esistente"}. Confermare manualmente il collegamento prima di modificare il CRM.`,
          candidate: [{ id: esistente.id, nome: esistente.name ?? null, email: esistente.email ?? null }],
          rilevata_il: new Date().toISOString(),
        })
      }
    }
  }

  // Il recapito noto dal canale COMPLETA i dati: chiedere il numero a chi sta
  // scrivendo da quel numero bloccava il passaggio allo staff per un dato che
  // il sistema aveva in mano.
  const contattoCompleto = {
    ...result.contact,
    email: result.contact?.email?.trim() || identita.datiNoti?.email || null,
    phone: result.contact?.phone?.trim() || identita.numero || null,
  }

  let handoffMeta: Record<string, unknown> | undefined
  if (result.staffRequested && contactIsComplete(contattoCompleto)) {
    const handoff = await registerStaffHandoff({
      supabase,
      propertyId,
      conversationId,
      channel,
      contact: contattoCompleto,
      question: incomingText,
    })
    handoffMeta = {
      ai_handoff: true,
      ai_handoff_registered: handoff.registered,
      ai_handoff_already_open: handoff.alreadyOpen,
      ai_handoff_todo_id: handoff.todoId ?? null,
      ai_handoff_manubot_task_id: handoff.manubotTaskId ?? null,
      ai_handoff_errors: handoff.errors.length > 0 ? handoff.errors : null,
    }

    // The promise is added HERE, by the code that knows whether the request was
    // actually registered — not by the model. The model was measured promising
    // a callback while still asking for a surname the guest had already given,
    // and it has no way of knowing whether the task was really created.
    if (handoff.registered) {
      result.answer = `${result.answer ?? ""}\n\nHo passato la sua richiesta al nostro staff, che la ricontatterà al più presto.`.trim()
    }
  }

  const baseMetadata = {
    channel,
    ai_generated: true,
    ai_confidence: result.confidence,
    // Il punteggio da solo non dice se la risposta si appoggiava alla base: la
    // soglia della base puo' cambiare dopo, e allora lo stesso numero
    // significherebbe il contrario. Il fatto viene salvato quando e' noto.
    ai_grounded: result.grounded,
    ai_reason: result.reason ?? null,
    ai_source_ids: result.usedChunks.map((c) => c.source_id),
    ai_knowledge_base_id: primary.id,
    ...(handoffMeta ?? {}),
    ...(unioneMeta ?? {}),
  }

  // ON REQUEST: store a draft for operator approval; do not deliver.
  if (mode === "on_request") {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "agent",
        content: result.answer,
        content_type: "text",
        status: "draft",
        stored_at: new Date().toISOString(),
        metadata: { ...baseMetadata, ai_draft: true },
      })
      .select("id")
      .single()

    if (error) {
      console.log(`[v0] autopilot draft insert error: ${error.message}`)
      return { action: "skipped", reason: "draft_insert_failed" }
    }
    return { action: "draft", messageId: data.id, confidence: result.confidence }
  }

  // AUTOPILOT: deliver, then persist as a sent agent message.
  if (mode === "autopilot") {
    if (!send) return { action: "skipped", reason: "no_sender" }
    let externalId: string | undefined
    try {
      const sendResult = await send(result.answer)
      externalId = sendResult?.externalId
    } catch (err) {
      console.log(`[v0] autopilot send failed: ${err instanceof Error ? err.message : String(err)}`)
      return { action: "skipped", reason: "send_failed" }
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        property_id: propertyId,
        conversation_id: conversationId,
        sender_type: "agent",
        content: result.answer,
        content_type: "text",
        status: "sent",
        external_message_id: externalId ?? null,
        stored_at: new Date().toISOString(),
        metadata: { ...baseMetadata, ai_autopilot: true },
      })
      .select("id")
      .single()

    if (!error) {
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .eq("property_id", propertyId)
    } else {
      console.log(`[v0] autopilot sent-log insert error: ${error.message}`)
    }

    return { action: "sent", messageId: data?.id, confidence: result.confidence }
  }

  return { action: "skipped", reason: "unknown_mode" }
}

/**
 * Testo di ripiego, con le sole domande necessarie.
 *
 * Non promette mai che la richiesta e' stata inoltrata: in questo ramo nessun
 * passaggio allo staff e' stato registrato.
 */
function testoRipiego(datiNoti: DatiNoti | null): string {
  const mancano: string[] = []
  if (!datiNoti?.nome) mancano.push("il suo nome e cognome")
  if (!datiNoti?.email) mancano.push("un'email")

  const apertura = "Grazie per il messaggio! Su questa richiesta preferisco farla rispondere direttamente dal nostro staff"

  if (mancano.length === 0) {
    // Nome ed email note e numero noto: non c'e' nulla da chiedere.
    return `${apertura}. Ho tutto quello che serve per farla ricontattare.`
  }
  if (datiNoti?.email && datiNoti.daAnagraficaEsistente) {
    return `${apertura}: mi confermate ${mancano.join(" e ")}? Le risulta l'email ${datiNoti.email}.`
  }
  return `${apertura}: può indicarmi ${mancano.join(" e ")} così li faccio ricontattare?`
}

interface Identita {
  datiNoti: DatiNoti | null
  anagrafica: AnagraficaTrovata | null
  numero: string | null
  /** Piu' schede curate rispondono a questo numero: decide una persona. */
  ambiguita: Segnalazione | null
}

/**
 * Chi sta scrivendo in questa conversazione.
 *
 * Il numero non si legge dall'anagrafica (che spesso non lo ha) ma dai messaggi
 * in arrivo: `metadata.from_phone` e' scritto dal webhook WhatsApp ed e' il
 * mittente reale, non un dato copiato a mano.
 */
async function caricaIdentita(
  supabase: SupabaseClient,
  propertyId: string,
  conversationId: string,
): Promise<Identita> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("contact_id")
    .eq("id", conversationId)
    .eq("property_id", propertyId)
    .maybeSingle()

  const { data: ultimoIngresso } = await supabase
    .from("messages")
    .select("metadata")
    .eq("conversation_id", conversationId)
    .eq("property_id", propertyId)
    .eq("sender_type", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const meta = (ultimoIngresso?.metadata ?? {}) as Record<string, unknown>
  const numero = typeof meta.from_phone === "string" && meta.from_phone.trim() ? meta.from_phone.trim() : null
  const nomeProfilo = typeof meta.from_name === "string" ? meta.from_name : null

  let anagrafica: AnagraficaTrovata | null = null
  if (conv?.contact_id) {
    const { data } = await supabase
      .from("contacts")
      .select("id, name, email, phone, whatsapp_id, source")
      .eq("id", conv.contact_id as string)
      .maybeSingle()
    anagrafica = (data as unknown as AnagraficaTrovata) ?? null
  }

  // Anagrafica creata dal canale (nome "FM", nessuna email): non e' un
  // riconoscimento. Si tenta il riconoscimento vero sul numero.
  let ambiguita: Segnalazione | null = null
  if (numero && (!anagrafica || anagrafica.source === "whatsapp")) {
    const candidati = await trovaCandidatiPerNumero(supabase, propertyId, numero)
    ambiguita = segnalazioneAmbiguita(candidati, `al numero +${numero}`)
    const riconosciuta = scegliAnagrafica(candidati)
    if (riconosciuta && riconosciuta.source !== "whatsapp") anagrafica = riconosciuta
  }

  return { datiNoti: datiNotiDaAnagrafica(anagrafica, numero, nomeProfilo), anagrafica, numero, ambiguita }
}

/**
 * Load recent conversation turns (customer + delivered agent replies) as
 * chat history for grounding. Drafts and system messages are excluded.
 */
async function loadHistory(
  supabase: SupabaseClient,
  conversationId: string,
  propertyId: string,
): Promise<ConversationTurn[]> {
  const { data } = await supabase
    .from("messages")
    .select("sender_type, content, status, stored_at")
    .eq("conversation_id", conversationId)
    .eq("property_id", propertyId)
    .in("sender_type", ["customer", "agent"])
    .neq("status", "draft")
    .order("stored_at", { ascending: true })
    .limit(20)

  if (!data) return []
  return data
    .filter((m) => typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: m.sender_type === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.content as string,
    }))
}
