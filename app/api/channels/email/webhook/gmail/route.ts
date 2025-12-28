import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { EmailProcessor, type InboundEmail } from "@/lib/email/email-processor"

// Gmail Pub/Sub webhook endpoint

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Gmail webhook endpoint is active",
    timestamp: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date() // Log when we received the webhook

  try {
    const rawBody = await request.text()
    const body = JSON.parse(rawBody)

    const message = body.message
    if (!message?.data) {
      return NextResponse.json({ status: "ok" })
    }

    const decodedData = Buffer.from(message.data, "base64").toString()
    const notification = JSON.parse(decodedData)
    const { emailAddress, historyId } = notification

    if (!emailAddress || !historyId) {
      return NextResponse.json({ status: "ok" })
    }

    const supabase = await createClient()

    // Find email channel
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("*")
      .eq("email_address", emailAddress)
      .eq("provider", "gmail")
      .eq("push_enabled", true)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ status: "ok" })
    }

    // TASK 2: Idempotency - check if we've processed this historyId
    const lastHistoryId = channel.gmail_history_id || 0
    if (Number(historyId) <= Number(lastHistoryId)) {
      // Already processed - idempotent response
      return NextResponse.json({ status: "ok" })
    }

    // Process new emails
    await syncNewEmails(supabase, channel, lastHistoryId, historyId)

    // Update history ID atomically
    await supabase
      .from("email_channels")
      .update({
        gmail_history_id: historyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel.id)
      .eq("gmail_history_id", lastHistoryId) // Optimistic locking

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("[Gmail Webhook] Error:", error)
    // Always return 200 to prevent Pub/Sub retries
    return NextResponse.json({ status: "ok" })
  }
}

async function syncNewEmails(supabase: any, channel: any, startHistoryId: number, endHistoryId: number) {
  try {
    // Refresh token if needed
    if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/oauth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id }),
      })

      if (!refreshResponse.ok) return

      const { data: refreshedChannel } = await supabase
        .from("email_channels")
        .select("oauth_access_token")
        .eq("id", channel.id)
        .single()

      channel.oauth_access_token = refreshedChannel?.oauth_access_token
    }

    // Get history changes
    const historyResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${channel.oauth_access_token}` } },
    )

    if (!historyResponse.ok) {
      if (historyResponse.status === 404) {
        // History expired - trigger full sync
        await triggerFullSync(channel)
      }
      return
    }

    const historyData = await historyResponse.json()
    if (!historyData.history) return

    // Extract new message IDs (deduplicated)
    const newMessageIds = new Set<string>()
    for (const entry of historyData.history) {
      if (entry.messagesAdded) {
        for (const added of entry.messagesAdded) {
          if (added.message?.labelIds?.includes("INBOX")) {
            newMessageIds.add(added.message.id)
          }
        }
      }
    }

    // Process each message with EmailProcessor
    const processor = new EmailProcessor(supabase)

    for (const messageId of newMessageIds) {
      await fetchAndProcessMessage(processor, supabase, channel, messageId)
    }
  } catch (error) {
    console.error("[Gmail Webhook] Sync error:", error)
  }
}

async function fetchAndProcessMessage(processor: EmailProcessor, supabase: any, channel: any, messageId: string) {
  try {
    // Fetch full message from Gmail
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${channel.oauth_access_token}` } },
    )

    if (!msgResponse.ok) return

    const msg = await msgResponse.json()
    const email = parseGmailMessage(msg)

    // Process with centralized processor (handles idempotency, threading, etc.)
    await processor.processInboundEmail(email, channel.id, channel.property_id)
  } catch (error) {
    console.error("[Gmail Webhook] Error processing message:", messageId, error)
  }
}

function parseGmailMessage(msg: any): InboundEmail {
  const headers = msg.payload?.headers || []
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

  let body = ""
  let contentType: "text" | "html" = "text"

  const decodeContent = (data: string) => {
    try {
      return Buffer.from(data, "base64url").toString("utf-8")
    } catch {
      return Buffer.from(data, "base64").toString("utf-8")
    }
  }

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
    body = decodeContent(msg.payload.body.data)
    contentType = msg.payload.mimeType?.includes("html") ? "html" : "text"
  } else if (msg.payload?.parts) {
    const htmlPart = findPart(msg.payload.parts, "text/html")
    const textPart = findPart(msg.payload.parts, "text/plain")

    if (htmlPart?.body?.data) {
      body = decodeContent(htmlPart.body.data)
      contentType = "html"
    } else if (textPart?.body?.data) {
      body = decodeContent(textPart.body.data)
      contentType = "text"
    }
  }

  const dateStr = getHeader("Date")
  const receivedAt = dateStr ? new Date(dateStr) : new Date()

  return {
    externalId: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    body: body || msg.snippet || "",
    contentType,
    receivedAt,
    inReplyTo: getHeader("In-Reply-To"),
    references: getHeader("References"),
    labelIds: msg.labelIds || [],
  }
}

async function triggerFullSync(channel: any) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_id: channel.id,
        property_id: channel.property_id,
      }),
    })
  } catch (error) {
    console.error("[Gmail Webhook] Full sync trigger failed:", error)
  }
}
