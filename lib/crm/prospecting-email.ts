import "server-only"

import * as nodemailer from "nodemailer"
import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptChannelSecrets } from "@/lib/email/channel-secrets"
import { getValidGmailToken, gmailFetchWithToken } from "@/lib/gmail-client"
import { addDays, defaultEmailDraft } from "@/lib/crm/prospecting"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function encodeRawEmail(input: { from: string; to: string; subject: string; body: string }) {
  const html = escapeHtml(input.body).replace(/\n/g, "<br>")
  const raw = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    `<div style="font-family:Arial,sans-serif;line-height:1.6">${html}</div>`,
  ].join("\r\n")

  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function ensureContact(db: SupabaseClient, prospect: any) {
  const email = String(prospect.email ?? "").trim().toLowerCase()
  if (!email) throw new Error("Prospect senza email")

  if (prospect.contact_id) {
    const { data: linked, error } = await db
      .from("contacts")
      .select("id, unsubscribed")
      .eq("id", prospect.contact_id)
      .eq("property_id", prospect.property_id)
      .maybeSingle()
    if (error) throw error
    if (linked?.unsubscribed) throw new Error("Il contatto risulta disiscritto")
    if (linked?.id) return linked.id as string
  }

  const { data: existing, error: existingError } = await db
    .from("contacts")
    .select("id, unsubscribed")
    .eq("property_id", prospect.property_id)
    .ilike("email", email)
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.unsubscribed) throw new Error("Il contatto risulta disiscritto")

  let contactId = existing?.id as string | undefined
  if (!contactId) {
    const { data: inserted, error } = await db
      .from("contacts")
      .insert({
        property_id: prospect.property_id,
        name: prospect.full_name,
        email,
        company: prospect.organization_name,
        city: prospect.city,
        country: prospect.country,
        source: "apollo",
        marketing_consent: false,
        unsubscribed: false,
      })
      .select("id")
      .single()
    if (error) throw error
    contactId = inserted.id
  }

  await db
    .from("crm_apollo_prospects")
    .update({ contact_id: contactId, status: "imported", imported_at: prospect.imported_at ?? new Date().toISOString() })
    .eq("id", prospect.id)
    .eq("property_id", prospect.property_id)

  return contactId
}

async function sendViaGmail(db: SupabaseClient, channel: any, to: string, subject: string, body: string) {
  const token = await getValidGmailToken(channel.id, db)
  if (!token.token) throw new Error(token.error || "Token Gmail non disponibile")
  const from = channel.display_name ? `${channel.display_name} <${channel.email_address}>` : channel.email_address
  const result = await gmailFetchWithToken(token.token, "messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeRawEmail({ from, to, subject, body }) }),
  })
  if (result.error || !result.data?.id) throw new Error(result.error || "Gmail non ha restituito un message id")
  return { messageId: String(result.data.id), threadId: result.data.threadId ? String(result.data.threadId) : null }
}

async function sendViaSmtp(channelRow: any, to: string, subject: string, body: string) {
  const channel = decryptChannelSecrets(channelRow)
  if (!channel.smtp_host || !channel.smtp_user || !channel.smtp_password) {
    throw new Error("Configurazione SMTP incompleta")
  }
  const transporter = nodemailer.createTransport({
    host: channel.smtp_host,
    port: channel.smtp_port || 587,
    secure: channel.smtp_port === 465,
    auth: { user: channel.smtp_user, pass: channel.smtp_password },
  })
  const info = await transporter.sendMail({
    from: channel.display_name ? `"${channel.display_name}" <${channel.email_address}>` : channel.email_address,
    to,
    subject,
    text: body,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`,
  })
  return { messageId: String(info.messageId || "smtp"), threadId: null }
}

async function schedulePostEmailTask(db: SupabaseClient, prospect: any, activity: any, channelId: string, now: Date) {
  const action = activity.action === "email_intro" ? "email_followup" : "review"
  const dueAt = addDays(now, activity.action === "email_intro" ? 4 : 5)

  const { data: existing } = await db
    .from("crm_sales_activities")
    .select("id")
    .eq("property_id", prospect.property_id)
    .eq("prospect_id", prospect.id)
    .eq("action", action)
    .in("status", ["pending", "ready"])
    .limit(1)
    .maybeSingle()

  if (existing?.id) return

  let subject: string | null = null
  let body: string | null = null
  if (action === "email_followup") {
    const draft = defaultEmailDraft(prospect.full_name || "", prospect.organization_name, true)
    subject = draft.subject
    body = draft.body
  }

  const canAutoSend = action === "email_followup"
    && Boolean(prospect.automation_enabled)
    && Boolean(prospect.legal_basis)
    && !prospect.do_not_contact
    && !prospect.outreach_paused

  const { error } = await db.from("crm_sales_activities").insert({
    property_id: prospect.property_id,
    prospect_id: prospect.id,
    contact_id: prospect.contact_id ?? null,
    channel: action === "review" ? "system" : "email",
    action,
    status: canAutoSend ? "ready" : "pending",
    due_at: dueAt.toISOString(),
    subject,
    body,
    requires_human: !canAutoSend,
    approved_at: canAutoSend ? now.toISOString() : null,
    metadata: canAutoSend ? { sender_channel_id: channelId, source: "crm_prospecting_auto_followup" } : {},
  })
  if (error) throw error

  await db
    .from("crm_apollo_prospects")
    .update({ next_action: action, next_action_at: dueAt.toISOString(), updated_at: now.toISOString() })
    .eq("id", prospect.id)
    .eq("property_id", prospect.property_id)
}

export async function deliverProspectingEmail(db: SupabaseClient, activityId: string) {
  const { data: activity, error: activityError } = await db
    .from("crm_sales_activities")
    .select("*")
    .eq("id", activityId)
    .single()
  if (activityError || !activity) throw activityError || new Error("Attività non trovata")
  if (activity.sent_at || (activity.status === "completed" && activity.outcome === "sent")) {
    return { alreadySent: true, alreadyProcessing: false, activity }
  }
  if (activity.channel !== "email") throw new Error("L'attività non è email")
  if (!activity.subject || !activity.body) throw new Error("Bozza email incompleta")

  // Claim the activity atomically before touching the external provider. This
  // prevents overlapping Vercel cron runs from sending the same email twice.
  const claimTime = new Date().toISOString()
  const { data: claimed, error: claimError } = await db
    .from("crm_sales_activities")
    .update({ status: "processing", updated_at: claimTime })
    .eq("id", activity.id)
    .eq("property_id", activity.property_id)
    .eq("status", "ready")
    .is("sent_at", null)
    .select("id")
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) {
    const { data: current } = await db
      .from("crm_sales_activities")
      .select("status, sent_at, outcome")
      .eq("id", activity.id)
      .eq("property_id", activity.property_id)
      .maybeSingle()
    if (current?.sent_at || (current?.status === "completed" && current?.outcome === "sent")) {
      return { alreadySent: true, alreadyProcessing: false, activity }
    }
    if (current?.status === "processing") {
      return { alreadySent: false, alreadyProcessing: true, activity }
    }
    throw new Error("Attività email non pronta per l'invio")
  }

  const { data: prospect, error: prospectError } = await db
    .from("crm_apollo_prospects")
    .select("*")
    .eq("id", activity.prospect_id)
    .eq("property_id", activity.property_id)
    .single()
  if (prospectError || !prospect) throw prospectError || new Error("Prospect non trovato")
  if (prospect.do_not_contact || prospect.outreach_paused) throw new Error("Prospect bloccato")
  if (!prospect.legal_basis) throw new Error("Base giuridica non registrata")
  if (!prospect.email) throw new Error("Email prospect mancante")

  const metadata = (activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {}) as Record<string, unknown>
  const channelId = String(metadata.sender_channel_id || prospect.preferred_email_channel_id || "")
  if (!channelId) throw new Error("Mittente email non selezionato")

  const { data: channel, error: channelError } = await db
    .from("email_channels")
    .select("*")
    .eq("id", channelId)
    .eq("property_id", activity.property_id)
    .eq("is_active", true)
    .single()
  if (channelError || !channel) throw channelError || new Error("Canale email non disponibile")

  const contactId = await ensureContact(db, prospect)
  const sent = channel.provider === "gmail"
    ? await sendViaGmail(db, channel, prospect.email, activity.subject, activity.body)
    : await sendViaSmtp(channel, prospect.email, activity.subject, activity.body)

  const now = new Date()
  const nowIso = now.toISOString()

  // External delivery succeeded. Persist the sent marker before non-critical
  // Inbox logging so a transient logging error can never trigger a duplicate send.
  const { error: updateError } = await db
    .from("crm_sales_activities")
    .update({
      status: "completed",
      completed_at: nowIso,
      sent_at: nowIso,
      outcome: "sent",
      attempts: Number(activity.attempts || 0) + 1,
      last_error: null,
      contact_id: contactId,
      metadata: { ...metadata, sender_channel_id: channel.id, external_message_id: sent.messageId },
      updated_at: nowIso,
    })
    .eq("id", activity.id)
    .eq("property_id", activity.property_id)
  if (updateError) throw updateError

  await db
    .from("crm_apollo_prospects")
    .update({
      contact_id: contactId,
      sales_stage: "email_followup",
      last_action_at: nowIso,
      last_outcome: `${activity.action}:sent`,
      next_action: null,
      next_action_at: null,
      updated_at: nowIso,
    })
    .eq("id", prospect.id)
    .eq("property_id", activity.property_id)

  let conversationId: string | null = null
  try {
    const { data: conversation, error: conversationError } = await db
      .from("conversations")
      .insert({
        property_id: activity.property_id,
        contact_id: contactId,
        channel: "email",
        channel_id: channel.id,
        subject: activity.subject,
        contact_email: prospect.email,
        contact_name: prospect.full_name,
        gmail_thread_id: sent.threadId,
        last_message_at: nowIso,
        status: "open",
        metadata: { source: "crm_prospecting", prospect_id: prospect.id, activity_id: activity.id },
      })
      .select("id")
      .single()
    if (conversationError) throw conversationError
    conversationId = conversation.id

    const { error: messageError } = await db.from("messages").insert({
      conversation_id: conversation.id,
      property_id: activity.property_id,
      sender_type: "agent",
      content: activity.body,
      content_type: "text",
      external_message_id: sent.messageId,
      status: "sent",
      delivered_at: nowIso,
      metadata: {
        email_sent: true,
        sent_to: prospect.email,
        sent_from: channel.email_address,
        subject: activity.subject,
        source: "crm_prospecting",
        prospect_id: prospect.id,
      },
    })
    if (messageError) throw messageError

    await db
      .from("crm_sales_activities")
      .update({ metadata: { ...metadata, sender_channel_id: channel.id, external_message_id: sent.messageId, conversation_id: conversation.id } })
      .eq("id", activity.id)
      .eq("property_id", activity.property_id)
  } catch (error) {
    console.error("[crm/prospecting] email sent but Inbox logging failed:", error)
  }

  try {
    await schedulePostEmailTask(db, { ...prospect, contact_id: contactId }, activity, channel.id, now)
  } catch (error) {
    console.error("[crm/prospecting] email sent but next task scheduling failed:", error)
  }

  return { prospect, activity, contactId, conversationId, sent, alreadySent: false, alreadyProcessing: false }
}
