// Gmail Thread Reply API - Send reply to a thread
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"
import { getUserSignature, appendSignatureHtml } from "@/lib/email/signature"
import { captureOutboundRecipients, parseRecipientList } from "@/lib/crm/auto-capture"

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  console.log("[v0] GMAIL REPLY API - threadId:", threadId)

  try {
    const body = await request.json()
    const { content, to, cc, bcc, subject, channelId: requestedChannelId } = body

    if (!content) {
      return NextResponse.json({ error: "Contenuto mancante" }, { status: 400 })
    }

    // Normalize to/cc/bcc: accept string or array
    const normalizeRecipients = (input: unknown): string[] => {
      if (!input) return []
      if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter(Boolean)
      return String(input)
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }
    const toList = normalizeRecipients(to)
    const ccList = normalizeRecipients(cc)
    const bccList = normalizeRecipients(bcc)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { channelId } = await resolveGmailChannelId(supabase, user.id, requestedChannelId)

    if (!channelId) {
      return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })
    }

    const { data: channelData } = await supabase
      .from("email_channels")
      .select("id, email_address, display_name, name, property_id")
      .eq("id", channelId)
      .maybeSingle()

    if (!channelData) {
      return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })
    }

    const { token, error: tokenError } = await getValidGmailToken(channelId)
    if (!token) {
      return NextResponse.json({ error: tokenError || "Token non disponibile" }, { status: 401 })
    }

    // Get thread info to get the original message details for reply
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!threadRes.ok) {
      const errorBody = await threadRes.text()
      console.error("[v0] Gmail API thread.get error:", errorBody)
      return NextResponse.json({ error: "Thread non trovato" }, { status: 404 })
    }

    const threadData = await threadRes.json()
    const lastMessage = threadData.messages?.[threadData.messages.length - 1]

    if (!lastMessage) {
      return NextResponse.json({ error: "Nessun messaggio nel thread" }, { status: 400 })
    }

    // Extract headers from last message
    const headers = lastMessage.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

    const originalFrom = getHeader("From")
    const originalSubject = getHeader("Subject")
    const originalMessageId = getHeader("Message-ID")

    // Parse original sender email for default To when none provided by client
    const fromMatch = originalFrom.match(/<([^>]+)>/)
    const defaultReplyTo = fromMatch ? fromMatch[1] : originalFrom
    const finalToList = toList.length > 0 ? toList : [defaultReplyTo]

    // Build reply subject
    const replySubject = subject || (originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`)

    // Build RFC 2822 message with proper headers for threading
    const fromAddress = channelData.email_address
    const fromName = channelData.display_name || channelData.name || fromAddress.split("@")[0]

    const messageParts: string[] = [
      `From: "${fromName}" <${fromAddress}>`,
      `To: ${finalToList.join(", ")}`,
    ]
    if (ccList.length > 0) messageParts.push(`Cc: ${ccList.join(", ")}`)
    if (bccList.length > 0) messageParts.push(`Bcc: ${bccList.join(", ")}`)
    // Append the admin user's signature (rich-text HTML stored on admin_users)
    const { html: signatureHtml } = await getUserSignature(supabase, user.id, channelId)
    const bodyWithBreaks = content.replace(/\n/g, "<br>")
    const finalBody = appendSignatureHtml(bodyWithBreaks, signatureHtml)

    messageParts.push(
      `Subject: ${replySubject}`,
      `In-Reply-To: ${originalMessageId}`,
      `References: ${originalMessageId}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      `<div style="font-family: Arial, sans-serif; font-size: 14px;">${finalBody}</div>`,
    )

    const message = messageParts.join("\r\n")
    const base64Message = Buffer.from(message).toString("base64")
    // Convert base64 to base64url: replace + with -, / with _, remove padding =
    const encodedMessage = base64Message.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

    console.log(
      "[v0] Sending reply to:",
      finalToList.join(", "),
      "cc:",
      ccList.join(", ") || "-",
      "bcc:",
      bccList.join(", ") || "-",
      "subject:",
      replySubject,
    )

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
        threadId: threadId,
      }),
    })

    if (!sendRes.ok) {
      const errorData = await sendRes.json()
      console.error("[v0] Gmail send error:", errorData)
      return NextResponse.json({ error: errorData.error?.message || "Errore invio email" }, { status: 500 })
    }

    const sendData = await sendRes.json()
    console.log("[v0] Email sent successfully, messageId:", sendData.id)

    // Auto-capture TO recipients into CRM (fire-and-forget, never blocks reply).
    // Only TO addresses are captured — CC/BCC intentionally skipped to avoid
    // ingesting mailing lists, no-reply addresses, or internal copies.
    if (channelData.property_id && finalToList.length > 0) {
      const recipients = parseRecipientList(finalToList)
      captureOutboundRecipients(supabase, channelData.property_id, recipients).catch((e) =>
        console.error("[v0] auto-capture reply failed", e),
      )
    }

    return NextResponse.json({
      success: true,
      messageId: sendData.id,
      threadId: sendData.threadId,
    })
  } catch (error) {
    console.error("[v0] Gmail reply error:", error)
    return NextResponse.json({ error: "Errore durante l'invio" }, { status: 500 })
  }
}
