import crypto from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sendEmail } from "@/lib/email"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"

/** Tipi di attivita' registrabili nella timeline del lead (CRM).
 *  Allineati al CHECK della tabella sales_lead_activities. */
export type LeadActivityType =
  | "note"
  | "call"
  | "email_sent"
  | "email_received"
  | "stage_change"
  | "task"

/**
 * Registra una voce nella timeline attivita' del lead (tabella
 * sales_lead_activities). Best-effort: non blocca mai il flusso chiamante.
 */
export async function recordLeadActivity(input: {
  leadId: string
  type: LeadActivityType
  content?: string | null
  createdBy?: string | null
  salesAgentId?: string | null
  dueAt?: string | null
  metadata?: Record<string, unknown>
  svc?: Awaited<ReturnType<typeof createServiceRoleClient>>
}): Promise<void> {
  try {
    const svc = input.svc ?? (await createServiceRoleClient())
    await svc.from("sales_lead_activities").insert({
      lead_id: input.leadId,
      activity_type: input.type,
      content: input.content ?? null,
      created_by: input.createdBy ?? null,
      sales_agent_id: input.salesAgentId ?? null,
      due_at: input.dueAt ?? null,
      metadata: input.metadata ?? {},
    })
  } catch (e) {
    console.warn("[sales-messages] recordLeadActivity failed:", e instanceof Error ? e.message : e)
  }
}

/**
 * Registrazione delle conversazioni email tra venditori e lead.
 *
 * Ogni email inviata da un venditore (outbound) e ogni risposta del cliente
 * (inbound, catturata via IMAP da clienti@4bid.it) viene salvata in
 * sales_lead_messages, cosi' il venditore vede il thread nella propria area e
 * il super admin puo' supervisionarlo.
 */

export interface OutboundMessageInput {
  leadId: string
  salesAgentId?: string | null
  fromEmail?: string | null
  toEmail?: string | null
  subject?: string | null
  bodyHtml?: string | null
  bodyText?: string | null
  messageId?: string | null
}

/**
 * Salva un messaggio in USCITA (email del venditore al lead) e memorizza il
 * Message-ID sul lead per agganciare in seguito le risposte via header
 * In-Reply-To / References. Best-effort: non blocca l'invio email.
 */
export async function recordOutboundMessage(input: OutboundMessageInput): Promise<void> {
  try {
    const svc = await createServiceRoleClient()
    await svc.from("sales_lead_messages").insert({
      lead_id: input.leadId,
      sales_agent_id: input.salesAgentId ?? null,
      direction: "outbound",
      from_email: input.fromEmail ?? null,
      to_email: input.toEmail ?? null,
      subject: input.subject ?? null,
      body_html: input.bodyHtml ?? null,
      body_text: input.bodyText ?? null,
      message_id: input.messageId ?? null,
      received_at: new Date().toISOString(),
    })
    if (input.messageId) {
      await svc
        .from("sales_leads")
        .update({ last_outbound_message_id: input.messageId })
        .eq("id", input.leadId)
    }
    await recordLeadActivity({
      svc,
      leadId: input.leadId,
      salesAgentId: input.salesAgentId ?? null,
      type: "email_sent",
      content: input.subject ? `Email inviata: ${input.subject}` : "Email inviata al lead",
      metadata: { to: input.toEmail, from: input.fromEmail },
    })
  } catch (e) {
    console.warn("[sales-messages] recordOutboundMessage failed:", e instanceof Error ? e.message : e)
  }
}

export interface InboundMessageInput {
  leadId: string
  salesAgentId?: string | null
  fromEmail?: string | null
  toEmail?: string | null
  subject?: string | null
  bodyHtml?: string | null
  bodyText?: string | null
  messageId?: string | null
  inReplyTo?: string | null
  references?: string | null
  imapUid?: number | null
  receivedAt?: string | null
}

/**
 * Salva un messaggio in ENTRATA (risposta del cliente). Idempotente sull'UID
 * IMAP (indice unico) e sul message_id: se gia' presente, non duplica.
 * Aggiorna i contatori sul lead (last_reply_at, unread_replies++).
 *
 * @returns true se inserito, false se gia' presente / errore.
 */
export async function recordInboundMessage(input: InboundMessageInput): Promise<boolean> {
  try {
    const svc = await createServiceRoleClient()

    // Dedup: stesso message_id gia' registrato?
    if (input.messageId) {
      const { data: existing } = await svc
        .from("sales_lead_messages")
        .select("id")
        .eq("message_id", input.messageId)
        .eq("direction", "inbound")
        .maybeSingle()
      if (existing) return false
    }

    const { error } = await svc.from("sales_lead_messages").insert({
      lead_id: input.leadId,
      sales_agent_id: input.salesAgentId ?? null,
      direction: "inbound",
      from_email: input.fromEmail ?? null,
      to_email: input.toEmail ?? null,
      subject: input.subject ?? null,
      body_html: input.bodyHtml ?? null,
      body_text: input.bodyText ?? null,
      message_id: input.messageId ?? null,
      in_reply_to: input.inReplyTo ?? null,
      email_references: input.references ?? null,
      imap_uid: input.imapUid ?? null,
      received_at: input.receivedAt ?? new Date().toISOString(),
    })
    if (error) {
      // 23505 = unique_violation (UID gia' visto): non e' un errore reale.
      if ((error as { code?: string }).code === "23505") return false
      console.warn("[sales-messages] recordInboundMessage insert error:", error.message)
      return false
    }

    // Aggiorna contatori sul lead.
    const { data: lead } = await svc
      .from("sales_leads")
      .select("unread_replies")
      .eq("id", input.leadId)
      .maybeSingle()
    await svc
      .from("sales_leads")
      .update({
        last_reply_at: input.receivedAt ?? new Date().toISOString(),
        unread_replies: (lead?.unread_replies ?? 0) + 1,
      })
      .eq("id", input.leadId)

    // Avvisa via email il venditore proprietario del lead che e' arrivata una
    // risposta del cliente (oltre al badge "non letti" in /sales/leads).
    await notifyAgentOfReply(svc, input.leadId, input.salesAgentId ?? null)

    await recordLeadActivity({
      svc,
      leadId: input.leadId,
      salesAgentId: input.salesAgentId ?? null,
      type: "email_received",
      content: input.subject ? `Risposta dal lead: ${input.subject}` : "Risposta ricevuta dal lead",
      metadata: { from: input.fromEmail },
    })

    return true
  } catch (e) {
    console.warn("[sales-messages] recordInboundMessage failed:", e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Invia al venditore proprietario del lead una notifica email che e' arrivata
 * una risposta del cliente. Best-effort: non blocca la registrazione del
 * messaggio. Risolve l'email dell'agente da sales_agents (via salesAgentId o,
 * in fallback, dal sales_agent_id del lead).
 */
async function notifyAgentOfReply(
  svc: Awaited<ReturnType<typeof createServiceRoleClient>>,
  leadId: string,
  salesAgentId: string | null,
) {
  try {
    const { data: lead } = await svc
      .from("sales_leads")
      .select("first_name, last_name, hotel_name, sales_agent_id")
      .eq("id", leadId)
      .maybeSingle()

    const agentId = salesAgentId ?? lead?.sales_agent_id ?? null
    if (!agentId) return

    const { data: agent } = await svc
      .from("sales_agents")
      .select("display_name, email")
      .eq("id", agentId)
      .maybeSingle()
    if (!agent?.email) return

    const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim() || "un lead"
    const hotel = lead?.hotel_name ? ` (${lead.hotel_name})` : ""

    const html =
      `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">` +
      `<h2 style="margin:0 0 12px">Nuova risposta da ${leadName}</h2>` +
      `<p><strong>${leadName}</strong>${hotel} ha risposto alla tua email.</p>` +
      `<p><a href="${SITE_URL}/sales/leads" style="color:#0d9488">Apri la conversazione nell'area venditori</a> per leggerla e rispondere.</p>` +
      `</div>`

    await sendEmail({
      to: agent.email,
      subject: `Nuova risposta da ${leadName}`,
      html,
      type: "lead_reply",
    })
  } catch (e) {
    console.warn("[sales-messages] notifyAgentOfReply failed:", e instanceof Error ? e.message : e)
  }
}

export interface UnmatchedEmailInput {
  messageId?: string | null
  imapUid?: number | null
  inboxLabel?: string | null
  fromEmail?: string | null
  fromName?: string | null
  toEmail?: string | null
  recipients?: string[] | null
  subject?: string | null
  bodyHtml?: string | null
  bodyText?: string | null
  inReplyTo?: string | null
  references?: string | null
  suggestedAgentId?: string | null
  receivedAt?: string | null
}

/**
 * Salva una email ENTRANTE che NON e' stata abbinata ad alcun lead, in una coda
 * di revisione (sales_unmatched_emails) gestita dal super admin. Idempotente
 * sul message_id: se gia' presente (in qualsiasi stato), non duplica.
 *
 * @returns true se inserita come nuova, false se gia' presente / errore.
 */
export async function recordUnmatchedEmail(input: UnmatchedEmailInput): Promise<boolean> {
  try {
    const svc = await createServiceRoleClient()

    if (input.messageId) {
      const { data: existing } = await svc
        .from("sales_unmatched_emails")
        .select("id")
        .eq("message_id", input.messageId)
        .maybeSingle()
      if (existing) return false
    }

    const { error } = await svc.from("sales_unmatched_emails").insert({
      message_id: input.messageId ?? null,
      imap_uid: input.imapUid ?? null,
      inbox_label: input.inboxLabel ?? null,
      from_email: input.fromEmail ?? null,
      from_name: input.fromName ?? null,
      to_email: input.toEmail ?? null,
      recipients: input.recipients ?? null,
      subject: input.subject ?? null,
      body_html: input.bodyHtml ?? null,
      body_text: input.bodyText ?? null,
      in_reply_to: input.inReplyTo ?? null,
      email_references: input.references ?? null,
      suggested_agent_id: input.suggestedAgentId ?? null,
      status: "pending",
      received_at: input.receivedAt ?? new Date().toISOString(),
    })
    if (error) {
      if ((error as { code?: string }).code === "23505") return false
      console.warn("[sales-messages] recordUnmatchedEmail insert error:", error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn("[sales-messages] recordUnmatchedEmail failed:", e instanceof Error ? e.message : e)
    return false
  }
}

/**
 * Crea (o riusa) un lead per un dato venditore a partire da un'email entrante.
 * Usato sia dalla conversione manuale della coda "Posta non abbinata" sia dal
 * reader IMAP quando una mail arriva su un alias venditore noto.
 *
 * - Se esiste gia' un lead di QUEL venditore con la stessa email, lo riusa.
 * - Altrimenti lo crea: nome/cognome derivati dal "From: Nome Cognome <email>".
 *
 * @returns leadId, oppure null in caso di errore.
 */
export async function createLeadForAgent(input: {
  agentId: string
  fromEmail: string
  fromName?: string | null
  notes?: string
}): Promise<string | null> {
  try {
    const svc = await createServiceRoleClient()
    const fromEmail = input.fromEmail.toLowerCase()

    const { data: existingLead } = await svc
      .from("sales_leads")
      .select("id")
      .eq("sales_agent_id", input.agentId)
      .ilike("email", fromEmail)
      .limit(1)
      .maybeSingle()
    if (existingLead) return existingLead.id

    const name = (input.fromName || "").trim()
    const parts = name.split(/\s+/).filter(Boolean)
    const firstName = parts[0] || fromEmail.split("@")[0] || "Contatto"
    const lastName = parts.slice(1).join(" ") || ""

    const { data: newLead, error } = await svc
      .from("sales_leads")
      .insert({
        sales_agent_id: input.agentId,
        first_name: firstName,
        last_name: lastName,
        hotel_name: "",
        email: fromEmail,
        notes: input.notes ?? "Creato da email entrante",
        pipeline_stage: "new",
        tracking_token: crypto.randomBytes(16).toString("hex"),
      })
      .select("id")
      .single()
    if (error || !newLead) {
      console.warn("[sales-messages] createLeadForAgent error:", error?.message)
      return null
    }
    return newLead.id
  } catch (e) {
    console.warn("[sales-messages] createLeadForAgent failed:", e instanceof Error ? e.message : e)
    return null
  }
}
