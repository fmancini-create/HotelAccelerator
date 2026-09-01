// Gmail Compose API - Send new email (not a reply)
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"
import { getUserSignature, appendSignatureHtml } from "@/lib/email/signature"
import { captureOutboundRecipients, parseRecipientList } from "@/lib/crm/auto-capture"

const MAX_ATTACHMENTS_BYTES = 20 * 1024 * 1024

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim()
}

function base64Lines(buffer: Buffer) {
  return buffer.toString("base64").replace(/(.{76})/g, "$1\r\n")
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Keep composer formatting while dropping executable HTML. */
function sanitizeComposerHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/href\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, 'href="#"')
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || ""
    let to = ""
    let cc = ""
    let bcc = ""
    let subject = ""
    let emailBody = ""
    let emailBodyHtml = ""
    let requestedChannelId: string | undefined
    let attachments: File[] = []

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      to = String(form.get("to") || "")
      cc = String(form.get("cc") || "")
      bcc = String(form.get("bcc") || "")
      subject = String(form.get("subject") || "")
      emailBody = String(form.get("body") || "")
      emailBodyHtml = String(form.get("bodyHtml") || "")
      requestedChannelId = String(form.get("channelId") || "") || undefined
      attachments = form.getAll("attachments").filter((value): value is File => value instanceof File)
    } else {
      const body = await request.json()
      to = String(body.to || "")
      cc = String(body.cc || "")
      bcc = String(body.bcc || "")
      subject = String(body.subject || "")
      emailBody = String(body.body || "")
      emailBodyHtml = String(body.bodyHtml || "")
      requestedChannelId = body.channelId || undefined
    }

    if (!to.trim() || (!emailBody.trim() && !emailBodyHtml.trim())) {
      return NextResponse.json({ error: "Destinatario e contenuto obbligatori" }, { status: 400 })
    }

    const totalSize = attachments.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_ATTACHMENTS_BYTES) {
      return NextResponse.json({ error: "Gli allegati superano il limite complessivo di 20 MB" }, { status: 413 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

    const { channelId } = await resolveGmailChannelId(supabase, user.id, requestedChannelId)
    if (!channelId) return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })

    const { data: channelData } = await supabase
      .from("email_channels")
      .select("id, email_address, display_name, name, property_id")
      .eq("id", channelId)
      .maybeSingle()
    if (!channelData) return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })

    const { token, error: tokenError } = await getValidGmailToken(channelId)
    if (!token) return NextResponse.json({ error: tokenError || "Token non disponibile" }, { status: 401 })

    const fromAddress = channelData.email_address
    const fromName = channelData.display_name || channelData.name || fromAddress.split("@")[0]
    const { html: signatureHtml } = await getUserSignature(supabase, user.id)
    const composerHtml = emailBodyHtml.trim()
      ? sanitizeComposerHtml(emailBodyHtml)
      : escapeHtml(emailBody).replace(/\n/g, "<br>")
    const finalBody = appendSignatureHtml(composerHtml, signatureHtml)

    const headers = [
      `From: "${safeHeader(fromName)}" <${safeHeader(fromAddress)}>`,
      `To: ${safeHeader(to)}`,
      cc.trim() ? `Cc: ${safeHeader(cc)}` : null,
      bcc.trim() ? `Bcc: ${safeHeader(bcc)}` : null,
      `Subject: ${safeHeader(subject || "(nessun oggetto)")}`,
      "MIME-Version: 1.0",
    ].filter(Boolean) as string[]

    let message: string
    if (attachments.length === 0) {
      message = [
        ...headers,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        `<div style="font-family: Arial, sans-serif; font-size: 14px;">${finalBody}</div>`,
      ].join("\r\n")
    } else {
      const boundary = `ha_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const parts: string[] = [
        ...headers,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/html; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        `<div style="font-family: Arial, sans-serif; font-size: 14px;">${finalBody}</div>`,
      ]

      for (const file of attachments) {
        const bytes = Buffer.from(await file.arrayBuffer())
        const filename = safeHeader(file.name || "allegato")
        parts.push(
          `--${boundary}`,
          `Content-Type: ${safeHeader(file.type || "application/octet-stream")}; name="${filename}"`,
          "Content-Transfer-Encoding: base64",
          `Content-Disposition: attachment; filename="${filename}"`,
          "",
          base64Lines(bytes),
        )
      }
      parts.push(`--${boundary}--`, "")
      message = parts.join("\r\n")
    }

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(message).toString("base64url") }),
    })

    if (!sendRes.ok) {
      const errorData = await sendRes.json().catch(() => ({}))
      return NextResponse.json({ error: errorData.error?.message || "Errore invio email" }, { status: 500 })
    }

    const sendData = await sendRes.json()
    if (channelData.property_id) {
      const recipients = [...parseRecipientList(to), ...parseRecipientList(cc), ...parseRecipientList(bcc)]
      captureOutboundRecipients(supabase, channelData.property_id, recipients)
        .catch((e) => console.error("[Gmail compose] auto-capture failed", e))
    }

    return NextResponse.json({ success: true, messageId: sendData.id, threadId: sendData.threadId })
  } catch (error) {
    console.error("[Gmail compose] error", error)
    return NextResponse.json({ error: "Errore durante l'invio" }, { status: 500 })
  }
}
