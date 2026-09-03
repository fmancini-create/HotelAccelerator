import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parse } from "node-html-parser"
import { runAutopilot } from "@/lib/ai/autopilot"
import { sendGmailEmailWithServiceClient } from "@/lib/email/gmail-service-send"

export interface EmailAiTask {
  conversationId: string
  fromHeader: string // "Name <email>" or bare email
  subject: string
  threadId?: string
  externalId?: string // inbound Gmail messageId, used as In-Reply-To
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

/**
 * Run the AI assistant for a batch of freshly-received inbound emails.
 *
 * This function is intentionally usable by both Gmail Pub/Sub and the polling
 * fallback. It receives the service-role client from the caller so automatic
 * replies never depend on an interactive user cookie/RLS session.
 */
export async function processEmailAiTasks(
  supabase: SupabaseClient,
  channelId: string,
  propertyId: string,
  tasks: EmailAiTask[],
): Promise<void> {
  for (const task of tasks) {
    try {
      const to = extractEmailAddress(task.fromHeader)
      if (!to) continue

      const outcome = await runAutopilot({
        supabase,
        propertyId,
        conversationId: task.conversationId,
        channel: "email",
        channelId,
        incomingText: toPlainText(task.body, task.contentType),
        send: async (text) => {
          const html = `<div style="font-family: Arial, sans-serif; font-size: 14px;">${text.replace(
            /\n/g,
            "<br>",
          )}</div>`
          const sent = await sendGmailEmailWithServiceClient(
            supabase,
            channelId,
            to,
            replySubject(task.subject),
            html,
            task.externalId,
            task.threadId,
          )
          if (!sent.success) throw new Error(sent.error ?? "Errore invio Gmail")
          return { externalId: sent.messageId }
        },
      })

      console.info("[email-autopilot] processed", {
        channelId,
        propertyId,
        conversationId: task.conversationId,
        inboundExternalId: task.externalId ?? null,
        action: outcome.action,
        reason: outcome.reason ?? null,
      })
    } catch (e) {
      console.error("[email-autopilot] task failed", {
        channelId,
        propertyId,
        conversationId: task.conversationId,
        inboundExternalId: task.externalId ?? null,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }
}
