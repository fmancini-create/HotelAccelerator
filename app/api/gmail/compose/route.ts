// Gmail Compose API - Send new email (not a reply)
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"
import { getUserSignature, appendSignatureHtml } from "@/lib/email/signature"
import { captureOutboundRecipients, parseRecipientList } from "@/lib/crm/auto-capture"

export async function POST(request: NextRequest) {
  console.log("[v0] GMAIL COMPOSE API")

  try {
    const body = await request.json()
    const { to, subject, body: emailBody, channelId: requestedChannelId } = body

    if (!to || !emailBody) {
      return NextResponse.json({ error: "Destinatario e contenuto obbligatori" }, { status: 400 })
    }

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

    // Build RFC 2822 message
    const fromAddress = channelData.email_address
    const fromName = channelData.display_name || channelData.name || fromAddress.split("@")[0]

    // Append the admin user's signature
    const { html: signatureHtml } = await getUserSignature(supabase, user.id)
    const bodyWithBreaks = emailBody.replace(/\n/g, "<br>")
    const finalBody = appendSignatureHtml(bodyWithBreaks, signatureHtml)

    const messageParts = [
      `From: "${fromName}" <${fromAddress}>`,
      `To: ${to}`,
      `Subject: ${subject || "(nessun oggetto)"}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      `<div style="font-family: Arial, sans-serif; font-size: 14px;">${finalBody}</div>`,
    ]

    const message = messageParts.join("\r\n")
    const encodedMessage = Buffer.from(message).toString("base64url")

    console.log("[v0] Sending new email to:", to, "subject:", subject)

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
      }),
    })

    if (!sendRes.ok) {
      const errorData = await sendRes.json()
      console.error("[v0] Gmail send error:", errorData)
      return NextResponse.json({ error: errorData.error?.message || "Errore invio email" }, { status: 500 })
    }

    const sendData = await sendRes.json()
    console.log("[v0] New email sent successfully, messageId:", sendData.id)

    // Auto-capture TO recipients into CRM (fire-and-forget, never blocks send).
    if (channelData.property_id) {
      captureOutboundRecipients(
        supabase,
        channelData.property_id,
        parseRecipientList(to),
      ).catch((e) => console.error("[v0] auto-capture compose failed", e))
    }

    return NextResponse.json({
      success: true,
      messageId: sendData.id,
      threadId: sendData.threadId,
    })
  } catch (error) {
    console.error("[v0] Gmail compose error:", error)
    return NextResponse.json({ error: "Errore durante l'invio" }, { status: 500 })
  }
}
