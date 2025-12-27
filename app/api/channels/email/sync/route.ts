import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"
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

    const provider = channel.provider as OAuthProvider
    let emails: any[] = []

    if (provider === "gmail") {
      const { token, error: tokenError } = await getValidGmailToken(channel_id)
      if (!token) {
        return NextResponse.json({ error: tokenError || "Token non valido" }, { status: 401 })
      }
      emails = await fetchGmailMessages(token)
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

  let body = ""
  let contentType = "text"

  // Helper to decode base64url content
  const decodeContent = (data: string) => {
    try {
      return Buffer.from(data, "base64url").toString("utf-8")
    } catch {
      return Buffer.from(data, "base64").toString("utf-8")
    }
  }

  // Helper to find parts recursively (for nested multipart)
  const findPart = (parts: any[], mimeType: string): any => {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return part
      }
      if (part.parts) {
        const found = findPart(part.parts, mimeType)
        if (found) return found
      }
    }
    return null
  }

  // Try to get HTML first, then plain text
  if (msg.payload?.body?.data) {
    // Single part message
    body = decodeContent(msg.payload.body.data)
    contentType = msg.payload.mimeType?.includes("html") ? "html" : "text"
  } else if (msg.payload?.parts) {
    // Multipart message - prefer HTML
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

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),
    body,
    contentType, // Include content type in parsed message
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
      .maybeSingle()

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
      .maybeSingle()

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
    const { data: existingMsg } = await supabase.from("messages").select("id").eq("gmail_id", email.id).maybeSingle()

    if (existingMsg) {
      return false // Already imported
    }

    const { error: msgError } = await supabase.from("messages").insert({
      property_id,
      conversation_id: conversation.id,
      sender_type: "customer",
      content: email.body || email.snippet || "",
      content_type: email.contentType || "text", // Use content type from parsed message
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
    const { data: currentConv } = await supabase
      .from("conversations")
      .select("unread_count")
      .eq("id", conversation.id)
      .single()

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date(email.date).toISOString(),
        unread_count: (currentConv?.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id)

    return true
  } catch (error) {
    console.error("Error processing email:", error)
    return false
  }
}
