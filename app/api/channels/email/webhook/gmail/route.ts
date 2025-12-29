import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { EmailProcessor, type InboundEmail } from "@/lib/email/email-processor"

// Gmail Pub/Sub webhook endpoint
// VERSION: v744 - With HARD logging for debugging

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Gmail webhook endpoint is active",
    version: "v744",
    timestamp: new Date().toISOString(),
  })
}

export async function POST(request: NextRequest) {
  const receivedAt = new Date()

  console.log("==================================================")
  console.log("[GMAIL WEBHOOK v744] HIT at", receivedAt.toISOString())
  console.log("==================================================")

  try {
    const rawBody = await request.text()
    console.log("[GMAIL WEBHOOK] Raw body length:", rawBody.length)

    const body = JSON.parse(rawBody)
    console.log("[GMAIL WEBHOOK] Parsed body subscription:", body.subscription)

    const message = body.message
    if (!message?.data) {
      console.log("[GMAIL WEBHOOK] No message.data - returning ok")
      return NextResponse.json({ status: "ok" })
    }

    const decodedData = Buffer.from(message.data, "base64").toString()
    const notification = JSON.parse(decodedData)
    const { emailAddress, historyId } = notification

    console.log("[GMAIL WEBHOOK] Notification:", {
      emailAddress,
      historyId,
      messageId: message.messageId,
    })

    if (!emailAddress || !historyId) {
      console.log("[GMAIL WEBHOOK] Missing emailAddress or historyId")
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
      console.log("[GMAIL WEBHOOK] Channel not found for:", emailAddress, channelError?.message)
      return NextResponse.json({ status: "ok" })
    }

    const lastHistoryId = channel.gmail_history_id || 0
    console.log("[GMAIL WEBHOOK] Channel found:", {
      channelId: channel.id,
      email: channel.email_address,
      lastHistoryIdInDB: lastHistoryId,
      newHistoryId: historyId,
      willProcess: Number(historyId) > Number(lastHistoryId),
    })

    // Idempotency check
    if (Number(historyId) <= Number(lastHistoryId)) {
      console.log("[GMAIL WEBHOOK] SKIP - Already processed (historyId <= lastHistoryId)")
      return NextResponse.json({ status: "ok" })
    }

    console.log("[GMAIL WEBHOOK] PROCESSING - New historyId detected")
    const syncResult = await syncNewEmails(supabase, channel, lastHistoryId, historyId)
    console.log("[GMAIL WEBHOOK] Sync result:", syncResult)

    // Update history ID atomically
    const { error: updateError } = await supabase
      .from("email_channels")
      .update({
        gmail_history_id: historyId,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel.id)
      .eq("gmail_history_id", lastHistoryId) // Optimistic locking

    if (updateError) {
      console.log("[GMAIL WEBHOOK] WARNING: Failed to update historyId:", updateError.message)
    } else {
      console.log("[GMAIL WEBHOOK] SUCCESS: Updated historyId from", lastHistoryId, "to", historyId)
    }

    console.log("==================================================")
    console.log("[GMAIL WEBHOOK v744] COMPLETE")
    console.log("==================================================")

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("[GMAIL WEBHOOK] ERROR:", error)
    // Always return 200 to prevent Pub/Sub retries
    return NextResponse.json({ status: "ok" })
  }
}

async function syncNewEmails(
  supabase: any,
  channel: any,
  startHistoryId: number,
  endHistoryId: number,
): Promise<{ messagesFound: number; messagesInserted: number; conversationsCreated: number; errors: string[] }> {
  const result = {
    messagesFound: 0,
    messagesInserted: 0,
    conversationsCreated: 0,
    errors: [] as string[],
  }

  try {
    // Refresh token if needed
    if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
      console.log("[GMAIL WEBHOOK] Token expired, refreshing...")
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/oauth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id }),
      })

      if (!refreshResponse.ok) {
        result.errors.push("Token refresh failed")
        return result
      }

      const { data: refreshedChannel } = await supabase
        .from("email_channels")
        .select("oauth_access_token")
        .eq("id", channel.id)
        .single()

      channel.oauth_access_token = refreshedChannel?.oauth_access_token
      console.log("[GMAIL WEBHOOK] Token refreshed successfully")
    }

    // Get history changes
    const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`
    console.log("[GMAIL WEBHOOK] Fetching history from:", historyUrl)

    const historyResponse = await fetch(historyUrl, {
      headers: { Authorization: `Bearer ${channel.oauth_access_token}` },
    })

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text()
      console.log("[GMAIL WEBHOOK] History API error:", historyResponse.status, errorText)

      if (historyResponse.status === 404) {
        console.log("[GMAIL WEBHOOK] History expired - triggering full sync")
        await triggerFullSync(channel)
        result.errors.push("History expired, full sync triggered")
      }
      return result
    }

    const historyData = await historyResponse.json()
    console.log("[GMAIL WEBHOOK] History response:", {
      hasHistory: !!historyData.history,
      historyCount: historyData.history?.length || 0,
    })

    if (!historyData.history) {
      console.log("[GMAIL WEBHOOK] No new history entries")
      return result
    }

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

    result.messagesFound = newMessageIds.size
    console.log("[GMAIL WEBHOOK] New INBOX messages found:", result.messagesFound, Array.from(newMessageIds))

    if (result.messagesFound === 0) {
      return result
    }

    // Process each message with EmailProcessor
    const processor = new EmailProcessor(supabase)

    for (const messageId of newMessageIds) {
      const msgResult = await fetchAndProcessMessage(processor, supabase, channel, messageId)
      if (msgResult.success) {
        result.messagesInserted++
        if (msgResult.newConversation) {
          result.conversationsCreated++
        }
      } else if (msgResult.error) {
        result.errors.push(`${messageId}: ${msgResult.error}`)
      }
    }

    console.log("[GMAIL WEBHOOK] Processing complete:", result)
    return result
  } catch (error) {
    console.error("[GMAIL WEBHOOK] Sync error:", error)
    result.errors.push(String(error))
    return result
  }
}

async function fetchAndProcessMessage(
  processor: EmailProcessor,
  supabase: any,
  channel: any,
  messageId: string,
): Promise<{ success: boolean; newConversation?: boolean; error?: string }> {
  try {
    console.log("[GMAIL WEBHOOK] Fetching message:", messageId)

    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${channel.oauth_access_token}` } },
    )

    if (!msgResponse.ok) {
      const errorText = await msgResponse.text()
      console.log("[GMAIL WEBHOOK] Message fetch failed:", messageId, msgResponse.status, errorText)
      return { success: false, error: `Fetch failed: ${msgResponse.status}` }
    }

    const msg = await msgResponse.json()
    const email = parseGmailMessage(msg)

    console.log("[GMAIL WEBHOOK] Message parsed:", {
      id: messageId,
      from: email.from,
      subject: email.subject?.substring(0, 50),
      bodyLength: email.body?.length || 0,
      labelIds: email.labelIds,
    })

    // Process with centralized processor (handles idempotency, threading, etc.)
    const result = await processor.processInboundEmail(email, channel.id, channel.property_id)

    console.log("[GMAIL WEBHOOK] Message processed:", {
      id: messageId,
      success: result.success,
      isDuplicate: result.isDuplicate,
      conversationId: result.conversationId,
    })

    if (result.success && result.messageId && email.labelIds) {
      const isSpam = email.labelIds.includes("SPAM") || email.labelIds.includes("CATEGORY_SPAM")
      const isTrash = email.labelIds.includes("TRASH")
      const isInbox = email.labelIds.includes("INBOX")

      // Only update if we need to reflect spam/trash status
      if (isSpam || isTrash) {
        console.log(`[GMAIL WEBHOOK] WEBHOOK SAFETY: Message ${messageId} has labels: SPAM=${isSpam}, TRASH=${isTrash}`)
        // The labelIds from Gmail are the SOURCE OF TRUTH - store them as-is
      }
    }

    return {
      success: result.success && !result.isDuplicate,
      newConversation: result.newConversation,
    }
  } catch (error) {
    console.error("[GMAIL WEBHOOK] Error processing message:", messageId, error)
    return { success: false, error: String(error) }
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
    console.log("[GMAIL WEBHOOK] Triggering full sync for channel:", channel.id)
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel_id: channel.id,
        property_id: channel.property_id,
      }),
    })
  } catch (error) {
    console.error("[GMAIL WEBHOOK] Full sync trigger failed:", error)
  }
}
