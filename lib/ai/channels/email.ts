import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parse } from "node-html-parser"
import { runAutopilot } from "@/lib/ai/autopilot"
import { sendGmailEmailWithServiceClient } from "@/lib/email/gmail-service-send"

export interface EmailAiTask {
  conversationId: string
  fromHeader: string
  subject: string
  threadId?: string
  externalId?: string
  body: string
  contentType: "text" | "html"
}

function extractEmailAddress(fromHeader: string): string | null {
  if (!fromHeader) return null
  const m = fromHeader.match(/<([^>]+)>/)
  const value = (m ? m[1] : fromHeader).trim()
  return value.includes("@") ? value : null
}

function toPlainText(body: string, contentType: "text" | "html"): string {
  if (contentType !== "html") return body
  try {
    const root = parse(body, { comment: false })
    root.querySelectorAll("script, style").forEach((el) => el.remove())
    return root.textContent.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  } catch {
    return body.replace(/<[^>]+>/g, " ")
  }
}

function replySubject(subject: string): string {
  const s = (subject || "").trim()
  return /^re:/i.test(s) ? s : `Re: ${s || "(nessun oggetto)"}`
}

async function claimTask(
  supabase: SupabaseClient,
  propertyId: string,
  channelId: string,
  externalId: string,
): Promise<boolean> {
  const { error } = await supabase.from("email_ai_delivery_claims").insert({
    property_id: propertyId,
    email_channel_id: channelId,
    inbound_external_id: externalId,
    status: "processing",
    attempts: 1,
    lease_until: new Date(Date.now() + 2 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (!error) return true
  if (error.code === "23505") return false
  throw error
}

async function completeTask(
  supabase: SupabaseClient,
  channelId: string,
  externalId: string,
): Promise<void> {
  await supabase
    .from("email_ai_delivery_claims")
    .update({ status: "completed", last_error: null, updated_at: new Date().toISOString() })
    .eq("email_channel_id", channelId)
    .eq("inbound_external_id", externalId)
}

async function releaseTask(
  supabase: SupabaseClient,
  channelId: string,
  externalId: string,
  errorMessage: string,
): Promise<void> {
  await supabase
    .from("email_ai_delivery_claims")
    .delete()
    .eq("email_channel_id", channelId)
    .eq("inbound_external_id", externalId)

  console.warn("[email-autopilot] claim released for retry", {
    channelId,
    inboundExternalId: externalId,
    error: errorMessage,
  })
}

export async function processEmailAiTasks(
  supabase: SupabaseClient,
  channelId: string,
  propertyId: string,
  tasks: EmailAiTask[],
): Promise<void> {
  for (const task of tasks) {
    const externalId = task.externalId?.trim()
    if (!externalId) {
      console.warn("[email-autopilot] skipped task without inbound external id", {
        channelId,
        propertyId,
        conversationId: task.conversationId,
      })
      continue
    }

    let claimed = false
    try {
      claimed = await claimTask(supabase, propertyId, channelId, externalId)
      if (!claimed) continue

      const to = extractEmailAddress(task.fromHeader)
      if (!to) {
        await completeTask(supabase, channelId, externalId)
        continue
      }

      const outcome = await runAutopilot({
        supabase,
        propertyId,
        conversationId: task.conversationId,
        channel: "email",
        channelId,
        incomingText: toPlainText(task.body, task.contentType),
        send: async (text) => {
          const html = `<div style="font-family: Arial, sans-serif; font-size: 14px;">${text.replace(/\n/g, "<br>")}</div>`
          const sent = await sendGmailEmailWithServiceClient(
            supabase,
            channelId,
            to,
            replySubject(task.subject),
            html,
            externalId,
            task.threadId,
          )
          if (!sent.success) throw new Error(sent.error ?? "Errore invio Gmail")
          return { externalId: sent.messageId }
        },
      })

      if (outcome.reason === "send_failed") {
        await releaseTask(supabase, channelId, externalId, "send_failed")
        continue
      }

      await completeTask(supabase, channelId, externalId)
      console.info("[email-autopilot] processed", {
        channelId,
        propertyId,
        conversationId: task.conversationId,
        inboundExternalId: externalId,
        action: outcome.action,
        reason: outcome.reason ?? null,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (claimed) await releaseTask(supabase, channelId, externalId, message)
      console.error("[email-autopilot] task failed", {
        channelId,
        propertyId,
        conversationId: task.conversationId,
        inboundExternalId: externalId,
        message,
      })
    }
  }
}
