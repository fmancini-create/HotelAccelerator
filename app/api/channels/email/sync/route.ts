import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { OAuthProvider } from "@/lib/oauth-config"

// Sync emails from Gmail or Outlook
export async function POST(request: NextRequest) {
  try {
    const { channel_id, property_id } = await request.json()

    if (!channel_id || !property_id) {
      return NextResponse.json({ error: "channel_id e property_id obbligatori" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get channel
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("*")
      .eq("id", channel_id)
      .eq("property_id", property_id)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    if (!channel.oauth_access_token || !channel.provider) {
      return NextResponse.json({ error: "Canale non configurato con OAuth" }, { status: 400 })
    }

    // Check if token needs refresh
    if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
      // Refresh token first
      const refreshResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/channels/email/oauth/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id }),
        },
      )

      if (!refreshResponse.ok) {
        return NextResponse.json({ error: "Token scaduto. Ricollegare l'account." }, { status: 401 })
      }

      // Re-fetch channel with new token
      const { data: refreshedChannel } = await supabase
        .from("email_channels")
        .select("oauth_access_token")
        .eq("id", channel_id)
        .single()

      channel.oauth_access_token = refreshedChannel?.oauth_access_token
    }

    const provider = channel.provider as OAuthProvider
    let emails: any[] = []

    if (provider === "gmail") {
      emails = await fetchGmailMessages(channel.oauth_access_token)
    } else if (provider === "outlook") {
      emails = await fetchOutlookMessages(channel.oauth_access_token)
    }

    // Process and save emails
    let imported = 0
    for (const email of emails) {
      const result = await processInboundEmail(supabase, email, channel, property_id)
      if (result) imported++
    }

    // Update last sync time
    await supabase
      .from("email_channels")
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel_id)

    return NextResponse.json({
      success: true,
      imported,
      total: emails.length,
    })
  } catch (error) {
    console.error("Email sync error:", error)
    return NextResponse.json({ error: "Errore durante la sincronizzazione" }, { status: 500 })
  }
}

async function fetchGmailMessages(accessToken: string): Promise<any[]> {
  try {
    // Get list of messages (last 50, unread first)
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:inbox",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!listResponse.ok) return []

    const listData = await listResponse.json()
    if (!listData.messages) return []

    // Fetch full message details
    const messages = await Promise.all(
      listData.messages.slice(0, 20).map(async (msg: { id: string }) => {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        if (!msgResponse.ok) return null
        return msgResponse.json()
      }),
    )

    return messages.filter(Boolean).map(parseGmailMessage)
  } catch (error) {
    console.error("Gmail fetch error:", error)
    return []
  }
}

function parseGmailMessage(msg: any) {
  const headers = msg.payload?.headers || []
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

  // Get body content
  let body = ""
  if (msg.payload?.body?.data) {
    body = Buffer.from(msg.payload.body.data, "base64url").toString()
  } else if (msg.payload?.parts) {
    const textPart = msg.payload.parts.find((p: any) => p.mimeType === "text/plain")
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64url").toString()
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

async function fetchOutlookMessages(accessToken: string): Promise<any[]> {
  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$orderby=receivedDateTime desc",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!response.ok) return []

    const data = await response.json()
    return (data.value || []).map(parseOutlookMessage)
  } catch (error) {
    console.error("Outlook fetch error:", error)
    return []
  }
}

function parseOutlookMessage(msg: any) {
  return {
    id: msg.id,
    threadId: msg.conversationId,
    from: msg.from?.emailAddress?.address || "",
    fromName: msg.from?.emailAddress?.name || "",
    to: msg.toRecipients?.[0]?.emailAddress?.address || "",
    subject: msg.subject || "",
    date: msg.receivedDateTime,
    body: msg.body?.content || "",
    snippet: msg.bodyPreview || "",
    isRead: msg.isRead,
  }
}

async function processInboundEmail(supabase: any, email: any, channel: any, property_id: string): Promise<boolean> {
  try {
    // Extract sender email
    const fromMatch = email.from.match(/<(.+)>/)
    const senderEmail = fromMatch ? fromMatch[1] : email.from.trim()
    const senderName = email.fromName || email.from.split("<")[0].trim().replace(/"/g, "")

    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("property_id", property_id)
      .eq("email", senderEmail)
      .single()

    if (!contact) {
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          property_id,
          email: senderEmail,
          name: senderName || senderEmail.split("@")[0],
        })
        .select("id")
        .single()

      if (contactError) {
        console.error("Error creating contact:", contactError)
        return false
      }
      contact = newContact
    }

    // Find or create conversation by thread ID
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", property_id)
      .eq("gmail_thread_id", email.threadId)
      .single()

    if (!conversation) {
      const { data: newConv, error: convError } = await supabase
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
        .select("id")
        .single()

      if (convError) {
        console.error("Error creating conversation:", convError)
        return false
      }
      conversation = newConv
    }

    // Check if message already exists
    const { data: existingMsg } = await supabase.from("messages").select("id").eq("gmail_id", email.id).single()

    if (existingMsg) {
      return false // Already imported
    }

    // Insert message
    const { error: msgError } = await supabase.from("messages").insert({
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

    if (msgError) {
      console.error("Error creating message:", msgError)
      return false
    }

    // Update conversation last message
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date(email.date).toISOString(),
        unread_count: supabase.sql`unread_count + 1`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id)

    return true
  } catch (error) {
    console.error("Error processing email:", error)
    return false
  }
}
