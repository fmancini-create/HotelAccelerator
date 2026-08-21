import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateReply, type ConversationTurn } from "./generate"
import { registerStaffHandoff } from "./handoff"
import {
  contactFullName,
  contactIsComplete,
  extractContactDetails,
  handoffCancelledMessage,
  handoffContactPrompt,
  isHandoffCancellation,
  isStaffHandoffFollowup,
  mergeHandoffContacts,
  originalQuestionForHandoff,
  splitFullName,
  type HandoffContact,
} from "./handoff-utils"
import {
  cancelCollectingStaffHandoff,
  getCollectingStaffHandoff,
  markStaffHandoffRegistered,
  startCollectingStaffHandoff,
  updateCollectingStaffHandoff,
  type StaffHandoffState,
} from "./staff-handoff-state"
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
  /** The specific email_channels or messaging_channels row id that selects the knowledge bases. */
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
  const { primary, baseIds } = await getBasesForChannel(channelId, channel === "email" ? "email" : "messaging")
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

  const contattoNoto = contattoDaIdentita(identita)

  // Once the guest has accepted a handoff, the next messages are not ordinary
  // questions for the model. They are fields of a small, durable workflow. A
  // browser reload, an LLM variation or a terse answer such as "Filippo
  // Mancini" must not erase that workflow.
  if (mode === "autopilot" && send) {
    try {
      const collecting = await getCollectingStaffHandoff(supabase, propertyId, conversationId)
      if (collecting) {
        return proseguiPassaggioStaff({
          supabase,
          propertyId,
          conversationId,
          channel,
          send,
          incomingText,
          state: collecting,
          contattoNoto,
        })
      }

      // "Come?" and "sì grazie" are an acceptance only when they follow a
      // real staff offer. This code check takes precedence over an LLM that
      // might mistake the two-word follow-up for a new booking request.
      if (isStaffHandoffFollowup(incomingText, history)) {
        const state = await startCollectingStaffHandoff({
          supabase,
          propertyId,
          conversationId,
          channel,
          originalQuestion: originalQuestionForHandoff(history, incomingText),
          contact: mergeHandoffContacts(contattoNoto, extractContactDetails(incomingText)),
        })
        return proseguiPassaggioStaff({
          supabase,
          propertyId,
          conversationId,
          channel,
          send,
          incomingText,
          state,
          contattoNoto,
        })
      }
    } catch (err) {
      // Do not continue with a generated sentence that could claim a handoff.
      // The caller has already saved the guest message; a clear operational
      // error is safer than inventing that the staff was alerted.
      console.log(`[v0] lettura passaggio allo staff fallita: ${err instanceof Error ? err.message : String(err)}`)
      return inviaRispostaAutopilot({
        supabase,
        propertyId,
        conversationId,
        channel,
        send,
        testo: "Mi dispiace, al momento non riesco ad avviare la richiesta per lo staff. Può riprovare tra poco?",
        metadata: { ai_handoff_error: "state_unavailable" },
      })
    }
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

  // The model is still useful for detecting a direct, explicit request (for
  // example "preferisco parlare con qualcuno"), but it is not allowed to own
  // the state transition. From here on the durable record drives every reply.
  if (mode === "autopilot" && send && result.handoffIntent === "requested") {
    try {
      const state = await startCollectingStaffHandoff({
        supabase,
        propertyId,
        conversationId,
        channel,
        originalQuestion: originalQuestionForHandoff(history, incomingText),
        contact: mergeHandoffContacts(contattoNoto, result.contact, extractContactDetails(incomingText)),
      })
      return proseguiPassaggioStaff({
        supabase,
        propertyId,
        conversationId,
        channel,
        send,
        incomingText,
        state,
        contattoNoto,
      })
    } catch (err) {
      console.log(`[v0] avvio passaggio allo staff fallito: ${err instanceof Error ? err.message : String(err)}`)
      return inviaRispostaAutopilot({
        supabase,
        propertyId,
        conversationId,
        channel,
        send,
        testo: "Mi dispiace, al momento non riesco a registrare la richiesta per lo staff. Può riprovare tra poco?",
        metadata: { ai_handoff_error: "start_failed" },
      })
    }
  }

  if (!result.answer) {
    // No confident answer from the knowledge base. In autopilot mode we send a
    // brief courtesy/handoff message instead of staying silent, so the guest is
    // never left without a reply. In on_request mode we stay silent because an
    // operator already sees the conversation and will answer.
    if (mode === "autopilot" && send) {
      // This text is only an offer. Asking for personal details here without a
      // persistent handoff state is what caused the screenshoted context loss.
      const fallback = testoRipiego()
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
  if (mode === "on_request" && result.handoffIntent === "requested" && contactIsComplete(contattoCompleto)) {
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
 * A fallback may offer the staff, but it must not ask for personal data until
 * the visitor explicitly accepts. The accepting message creates durable state.
 */
function testoRipiego(): string {
  return "Mi dispiace, non ho questa informazione disponibile qui. Se desidera, posso metterla in contatto con il nostro staff."
}

function contattoDaIdentita(identita: Identita): HandoffContact {
  return mergeHandoffContacts(splitFullName(identita.datiNoti?.nome), {
    email: identita.datiNoti?.email ?? null,
    phone: identita.numero ?? identita.datiNoti?.numero ?? null,
  })
}

type AutopilotSender = (text: string) => Promise<{ externalId?: string } | void>

async function inviaRispostaAutopilot(args: {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  channel: AiChannel
  send: AutopilotSender
  testo: string
  metadata: Record<string, unknown>
}): Promise<RunAutopilotResult> {
  let externalId: string | undefined
  try {
    const sendResult = await args.send(args.testo)
    externalId = sendResult?.externalId
  } catch (err) {
    console.log(`[v0] invio risposta passaggio staff fallito: ${err instanceof Error ? err.message : String(err)}`)
    return { action: "skipped", reason: "send_failed" }
  }

  const { data, error } = await args.supabase
    .from("messages")
    .insert({
      property_id: args.propertyId,
      conversation_id: args.conversationId,
      sender_type: "agent",
      content: args.testo,
      content_type: "text",
      status: "sent",
      external_message_id: externalId ?? null,
      stored_at: new Date().toISOString(),
      metadata: {
        channel: args.channel,
        ai_generated: true,
        ai_autopilot: true,
        ...args.metadata,
      },
    })
    .select("id")
    .single()

  if (error) {
    // The guest already received the reply. The state row still protects the
    // next turn, while the missing log remains visible in runtime logs.
    console.log(`[v0] log risposta passaggio staff fallito: ${error.message}`)
  } else {
    await args.supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", args.conversationId)
      .eq("property_id", args.propertyId)
  }

  return { action: "sent", messageId: data?.id }
}

async function proseguiPassaggioStaff(args: {
  supabase: SupabaseClient
  propertyId: string
  conversationId: string
  channel: AiChannel
  send: AutopilotSender
  incomingText: string
  state: StaffHandoffState
  contattoNoto: HandoffContact
}): Promise<RunAutopilotResult> {
  const { supabase, propertyId, conversationId, channel, send, incomingText, state, contattoNoto } = args

  if (isHandoffCancellation(incomingText)) {
    await cancelCollectingStaffHandoff(supabase, state)
    return inviaRispostaAutopilot({
      supabase,
      propertyId,
      conversationId,
      channel,
      send,
      testo: handoffCancelledMessage(),
      metadata: { ai_handoff: true, ai_handoff_status: "cancelled", ai_handoff_id: state.id },
    })
  }

  // Persist first, then compose the reply. If delivery fails the collected
  // fields remain available for a retry and are never entrusted to model memory.
  const contatto = mergeHandoffContacts(state.contact, contattoNoto, extractContactDetails(incomingText))
  const aggiornato = await updateCollectingStaffHandoff(supabase, state, contatto)

  if (!contactIsComplete(aggiornato.contact)) {
    return inviaRispostaAutopilot({
      supabase,
      propertyId,
      conversationId,
      channel,
      send,
      testo: handoffContactPrompt(aggiornato.contact),
      metadata: { ai_handoff: true, ai_handoff_status: "collecting", ai_handoff_id: aggiornato.id },
    })
  }

  const handoff = await registerStaffHandoff({
    supabase,
    propertyId,
    conversationId,
    channel,
    contact: aggiornato.contact,
    question: aggiornato.originalQuestion,
  })

  if (!handoff.registered) {
    return inviaRispostaAutopilot({
      supabase,
      propertyId,
      conversationId,
      channel,
      send,
      testo: "Grazie, ho raccolto i dati. Al momento non riesco però a registrare la richiesta per lo staff: può riprovare tra poco?",
      metadata: {
        ai_handoff: true,
        ai_handoff_status: "collecting",
        ai_handoff_id: aggiornato.id,
        ai_handoff_registered: false,
        ai_handoff_errors: handoff.errors.length > 0 ? handoff.errors : null,
      },
    })
  }

  let statoAggiornato = true
  try {
    await markStaffHandoffRegistered(supabase, aggiornato, handoff.todoId, handoff.manubotTaskId)
  } catch (err) {
    // A durable todo/flag already exists. Keep the promise honest and leave the
    // row collecting so the next message can reconcile its status safely.
    statoAggiornato = false
    console.log(`[v0] conferma stato passaggio staff fallita: ${err instanceof Error ? err.message : String(err)}`)
  }

  const nome = contactFullName(aggiornato.contact)
  return inviaRispostaAutopilot({
    supabase,
    propertyId,
    conversationId,
    channel,
    send,
    testo: `Grazie${nome ? ` ${nome}` : ""}. Ho passato la sua richiesta al nostro staff, che la ricontatterà al più presto.`,
    metadata: {
      ai_handoff: true,
      ai_handoff_status: statoAggiornato ? "registered" : "registered_pending_state_sync",
      ai_handoff_id: aggiornato.id,
      ai_handoff_registered: true,
      ai_handoff_already_open: handoff.alreadyOpen,
      ai_handoff_todo_id: handoff.todoId ?? null,
      ai_handoff_manubot_task_id: handoff.manubotTaskId ?? null,
      ai_handoff_errors: handoff.errors.length > 0 ? handoff.errors : null,
    },
  })
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
