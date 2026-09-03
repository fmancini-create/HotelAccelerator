import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getValidGmailToken, gmailFetchWithToken } from "@/lib/gmail-client"

export async function sendGmailEmailWithServiceClient(
  supabase: SupabaseClient,
  channelId: string,
  to: string,
  subject: string,
  body: string,
  replyToMessageId?: string,
  threadId?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { data: channel, error: channelError } = await supabase
    .from("email_channels")
    .select("email_address, display_name, provider, is_active")
    .eq("id", channelId)
    .maybeSingle()

  if (channelError) {
    return { success: false, error: "Canale email temporaneamente non disponibile" }
  }
  if (!channel) {
    return { success: false, error: "Canale email non trovato" }
  }
  if (channel.is_active !== true) {
    return { success: false, error: "Canale email disattivato" }
  }
  if (channel.provider !== "gmail") {
    return { success: false, error: "Il canale non e configurato con Gmail" }
  }
  if (!channel.email_address) {
    return { success: false, error: "Email mittente non configurata" }
  }

  const tokenResult = await getValidGmailToken(channelId, supabase)
  if (!tokenResult.token) {
    return { success: false, error: tokenResult.error || "Token Gmail non disponibile" }
  }

  const fromHeader = channel.display_name
    ? `${channel.display_name} <${channel.email_address}>`
    : channel.email_address

  const headers = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
  ]

  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`)
    headers.push(`References: ${replyToMessageId}`)
  }

  const emailContent = `${headers.join("\r\n")}\r\n\r\n${body}`
  const raw = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const { data, error, status } = await gmailFetchWithToken(tokenResult.token, "messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  })

  if (error || !data?.id) {
    return { success: false, error: error || `Errore invio Gmail (HTTP ${status})` }
  }

  return { success: true, messageId: data.id as string }
}
