// Shared Gmail message parser. Converts a raw Gmail API message (format=full)
// into the internal InboundEmail contract used by EmailProcessor.
// Extracted so /api/channels/email/sync and /api/channels/email/sync/full
// and future Pub/Sub importers all produce identical records.

import type { InboundEmail } from "@/lib/email/email-processor"

function decodeBase64UrlToString(input: string): string {
  if (!input) return ""
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const pad = b64.length % 4
  if (pad) b64 += "=".repeat(4 - pad)
  return Buffer.from(b64, "base64").toString("utf-8")
}

export function parseGmailMessage(msg: any): InboundEmail {
  const headers = msg.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || ""

  let body = ""
  let contentType: "text" | "html" = "text"

  const findPart = (parts: any[], mimeType: string): any => {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) return part
      if (part.parts) {
        const found = findPart(part.parts, mimeType)
        if (found) return found
      }
    }
    return null
  }

  if (msg.payload?.body?.data) {
    body = decodeBase64UrlToString(msg.payload.body.data)
    contentType = msg.payload.mimeType?.includes("html") ? "html" : "text"
  } else if (msg.payload?.parts) {
    const htmlPart = findPart(msg.payload.parts, "text/html")
    const textPart = findPart(msg.payload.parts, "text/plain")
    if (htmlPart?.body?.data) {
      body = decodeBase64UrlToString(htmlPart.body.data)
      contentType = "html"
    } else if (textPart?.body?.data) {
      body = decodeBase64UrlToString(textPart.body.data)
      contentType = "text"
    }
  }

  const dateStr = getHeader("Date")

  return {
    externalId: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    body: body || msg.snippet || "",
    contentType,
    receivedAt: dateStr ? new Date(dateStr) : new Date(),
    inReplyTo: getHeader("In-Reply-To"),
    references: getHeader("References"),
    labelIds: msg.labelIds || [],
  }
}
