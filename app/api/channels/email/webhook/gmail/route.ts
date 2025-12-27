import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Gmail Pub/Sub webhook endpoint
// Google Cloud Pub/Sub sends push notifications here when new emails arrive

export async function GET(request: NextRequest) {
  console.log("[v0] Gmail webhook GET - Test endpoint called")
  return NextResponse.json({
    status: "ok",
    message: "Gmail webhook endpoint is active",
    timestamp: new Date().toISOString(),
    env_check: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? "set" : "missing",
      GOOGLE_PUBSUB_TOPIC: process.env.GOOGLE_PUBSUB_TOPIC ? "set" : "missing",
    },
  })
}

export async function POST(request: NextRequest) {
  console.log("[v0] ============================================")
  console.log("[v0] Gmail webhook POST - Request received!")
  console.log("[v0] Headers:", JSON.stringify(Object.fromEntries(request.headers.entries())))

  try {
    const rawBody = await request.text()
    console.log("[v0] Raw body:", rawBody.slice(0, 1000))

    const body = JSON.parse(rawBody)
    console.log("[v0] Gmail webhook parsed body:", JSON.stringify(body).slice(0, 500))

    // Pub/Sub message structure
    const message = body.message
    if (!message?.data) {
      console.log("[v0] No message data in webhook")
      return NextResponse.json({ status: "ok" })
    }

    // Decode base64 message data
    const decodedData = Buffer.from(message.data, "base64").toString()
    const notification = JSON.parse(decodedData)

    console.log("[v0] Gmail notification:", notification)

    // notification contains: { emailAddress, historyId }
    const { emailAddress, historyId } = notification

    if (!emailAddress || !historyId) {
      console.log("[v0] Missing emailAddress or historyId")
      return NextResponse.json({ status: "ok" })
    }

    const supabase = await createClient()

    // Find the email channel by email address
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("*")
      .eq("email_address", emailAddress)
      .eq("provider", "gmail")
      .eq("push_enabled", true)
      .single()

    if (channelError || !channel) {
      console.log("[v0] Channel not found for:", emailAddress)
      return NextResponse.json({ status: "ok" })
    }

    // Check if we need to sync (new history ID is higher)
    const lastHistoryId = channel.gmail_history_id || 0
    if (historyId <= lastHistoryId) {
      console.log("[v0] Already processed historyId:", historyId)
      return NextResponse.json({ status: "ok" })
    }

    // Trigger incremental sync
    await syncNewEmails(supabase, channel, lastHistoryId, historyId)

    // Update last history ID
    await supabase
      .from("email_channels")
      .update({
        gmail_history_id: historyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel.id)

    return NextResponse.json({ status: "ok" })
  } catch (error) {
    console.error("[v0] Gmail webhook error:", error)
    // Always return 200 to acknowledge receipt (prevents Pub/Sub retries)
    return NextResponse.json({ status: "ok" })
  }
}

async function syncNewEmails(supabase: any, channel: any, startHistoryId: number, endHistoryId: number) {
  try {
    // Check if token needs refresh
    if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/oauth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id }),
      })

      if (!refreshResponse.ok) {
        console.error("[v0] Token refresh failed")
        return
      }

      // Re-fetch channel with new token
      const { data: refreshedChannel } = await supabase
        .from("email_channels")
        .select("oauth_access_token")
        .eq("id", channel.id)
        .single()

      channel.oauth_access_token = refreshedChannel?.oauth_access_token
    }

    // Get history changes since last sync
    const historyResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
      {
        headers: { Authorization: `Bearer ${channel.oauth_access_token}` },
      },
    )

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text()
      console.error("[v0] Gmail history API error:", errorText)

      // If history is too old, do a full sync
      if (historyResponse.status === 404) {
        console.log("[v0] History expired, triggering full sync")
        await triggerFullSync(channel)
      }
      return
    }

    const historyData = await historyResponse.json()

    if (!historyData.history) {
      console.log("[v0] No new history entries")
      return
    }

    // Extract new message IDs
    const newMessageIds: string[] = []
    for (const entry of historyData.history) {
      if (entry.messagesAdded) {
        for (const added of entry.messagesAdded) {
          // Only process INBOX messages
          if (added.message?.labelIds?.includes("INBOX")) {
            newMessageIds.push(added.message.id)
          }
        }
      }
    }

    console.log("[v0] New messages to sync:", newMessageIds.length)

    // Fetch and process each new message
    for (const messageId of newMessageIds) {
      await fetchAndSaveMessage(supabase, channel, messageId)
    }
  } catch (error) {
    console.error("[v0] Sync error:", error)
  }
}

async function fetchAndSaveMessage(supabase: any, channel: any, messageId: string) {
  try {
    // Check if already imported
    const { data: existing } = await supabase.from("messages").select("id").eq("gmail_id", messageId).single()

    if (existing) {
      console.log("[v0] Message already exists:", messageId)
      return
    }

    // Fetch full message
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${channel.oauth_access_token}` } },
    )

    if (!msgResponse.ok) return

    const msg = await msgResponse.json()
    const email = parseGmailMessage(msg)

    // Process and save
    await processInboundEmail(supabase, email, channel, channel.property_id)

    console.log("[v0] Saved new message:", messageId)
  } catch (error) {
    console.error("[v0] Error saving message:", messageId, error)
  }
}

function parseGmailMessage(msg: any) {
  const headers = msg.payload?.headers || []
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

  let body = ""
  if (msg.payload?.body?.data) {
    body = Buffer.from(msg.payload.body.data, "base64").toString()
  } else if (msg.payload?.parts) {
    const textPart = msg.payload.parts.find((p: any) => p.mimeType === "text/plain")
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64").toString()
    }
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),
    body,
    snippet: msg.snippet,
    labelIds: msg.labelIds || [],
  }
}

async function processInboundEmail(supabase: any, email: any, channel: any, property_id: string) {
  try {
    const fromMatch = email.from.match(/<(.+)>/)
    const senderEmail = fromMatch ? fromMatch[1] : email.from.trim()
    const senderName = email.from.split("<")[0].trim().replace(/"/g, "")

    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", property_id)
      .eq("email", senderEmail)
      .single()

    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          property_id,
          email: senderEmail,
          name: senderName || senderEmail.split("@")[0],
        })
        .select("id")
        .single()
      contact = newContact
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, unread_count")
      .eq("property_id", property_id)
      .eq("gmail_thread_id", email.threadId)
      .single()

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          property_id,
          contact_id: contact.id,
          channel_id: channel.id,
          channel: "email",
          subject: email.subject || "(Nessun oggetto)",
          status: "open",
          gmail_thread_id: email.threadId,
          gmail_message_id: email.id,
          unread_count: 1,
          last_message_at: new Date(email.date).toISOString(),
        })
        .select("id, unread_count")
        .single()
      conversation = newConv
    }

    // Insert message
    await supabase.from("messages").insert({
      property_id,
      conversation_id: conversation.id,
      sender_type: "customer",
      content: email.body || email.snippet || "",
      content_type: "text",
      gmail_id: email.id,
      metadata: {
        from: email.from,
        to: email.to,
        subject: email.subject,
      },
      created_at: new Date(email.date).toISOString(),
    })

    const currentUnread = conversation?.unread_count || 0
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date(email.date).toISOString(),
        unread_count: currentUnread + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id)

    return true
  } catch (error) {
    console.error("Error processing email:", error)
    return false
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
    console.error("[v0] Full sync trigger failed:", error)
  }
}
