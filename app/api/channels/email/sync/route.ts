import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"
import { EmailProcessor, type InboundEmail } from "@/lib/email/email-processor"
import type { OAuthProvider } from "@/lib/oauth-config"

const API_VERSION = "v779-base64url-fix"

function decodeBase64UrlToString(input: string): string {
  if (!input) return ""
  // Gmail uses base64url (RFC 4648 URL-safe): replace - with +, _ with /
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  // Pad to multiple of 4
  const pad = b64.length % 4
  if (pad) b64 += "=".repeat(4 - pad)
  return Buffer.from(b64, "base64").toString("utf-8")
}

export async function POST(request: NextRequest) {
  console.log(`[SMART-SYNC] ========== BUILD ${API_VERSION} ==========`)

  try {
    const { channel_id, property_id } = await request.json()
    console.log(`[SMART-SYNC] INPUT: channel_id=${channel_id}, property_id=${property_id}`)

    if (!channel_id || !property_id) {
      console.error("[SMART-SYNC] Missing channel_id or property_id")
      return NextResponse.json({ error: "channel_id e property_id obbligatori" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("*")
      .eq("id", channel_id)
      .eq("property_id", property_id)
      .single()

    if (channelError || !channel) {
      console.error("[SMART-SYNC] Channel not found:", channelError)
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    console.log(`[SMART-SYNC] Channel found: provider=${channel.provider}, email=${channel.email_address}`)

    if (!channel.oauth_access_token || !channel.provider) {
      console.error("[SMART-SYNC] Channel not configured with OAuth")
      return NextResponse.json({ error: "Canale non configurato con OAuth" }, { status: 400 })
    }

    const provider = channel.provider as OAuthProvider
    let emails: InboundEmail[] = []

    if (provider === "gmail") {
      console.log("[SMART-SYNC] Fetching Gmail messages...")
      const { token, error: tokenError } = await getValidGmailToken(channel_id)
      if (!token) {
        console.error("[SMART-SYNC] Token error:", tokenError)
        return NextResponse.json({ error: tokenError || "Token non valido" }, { status: 401 })
      }
      emails = await fetchGmailMessages(token)
      console.log(`[SMART-SYNC] Fetched ${emails.length} Gmail messages`)
    } else if (provider === "outlook") {
      emails = await fetchOutlookMessages(channel.oauth_access_token)
      console.log(`[SMART-SYNC] Fetched ${emails.length} Outlook messages`)
    }

    // Process with centralized EmailProcessor
    const processor = new EmailProcessor(supabase)
    let imported = 0
    let duplicates = 0
    let errors = 0

    for (const email of emails) {
      try {
        const result = await processor.processInboundEmail(email, channel.id, property_id)
        if (result.success) {
          if (result.isDuplicate) {
            duplicates++
          } else {
            imported++
            console.log(`[SMART-SYNC] Imported: ${email.subject?.substring(0, 50)}...`)
          }
        }
      } catch (err) {
        errors++
        console.error(`[SMART-SYNC] Error processing email ${email.externalId}:`, err)
      }
    }

    // Update last sync time
    await supabase
      .from("email_channels")
      .update({
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel_id)

    const result = {
      success: true,
      imported,
      duplicates,
      errors,
      total: emails.length,
      version: API_VERSION,
    }

    console.log(`[SMART-SYNC] Result:`, result)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[SMART-SYNC] Fatal error:", error)
    return NextResponse.json({ error: "Errore durante la sincronizzazione" }, { status: 500 })
  }
}

async function fetchGmailMessages(accessToken: string): Promise<InboundEmail[]> {
  try {
    const listResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=in:inbox",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!listResponse.ok) {
      if (listResponse.status === 429) {
        throw new Error("Gmail rate limit exceeded. Riprova tra qualche minuto.")
      }
      return []
    }

    const listData = await listResponse.json()
    if (!listData.messages) return []

    const messages: InboundEmail[] = []
    const messagesToFetch = listData.messages.slice(0, 15)

    for (const msg of messagesToFetch) {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )

        if (msgResponse.status === 429) break

        if (msgResponse.ok) {
          const msgData = await msgResponse.json()
          messages.push(parseGmailMessage(msgData))
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Error fetching message ${msg.id}:`, error)
      }
    }

    return messages
  } catch (error) {
    console.error("Gmail fetch error:", error)
    throw error
  }
}

function parseGmailMessage(msg: any): InboundEmail {
  const headers = msg.payload?.headers || []
  const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

  let body = ""
  let contentType: "text" | "html" = "text"

  const decodeContent = (data: string) => {
    return decodeBase64UrlToString(data)
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

async function fetchOutlookMessages(accessToken: string): Promise<InboundEmail[]> {
  try {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$orderby=receivedDateTime desc",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!response.ok) return []

    const data = await response.json()
    return (data.value || []).map(
      (msg: any): InboundEmail => ({
        externalId: msg.id,
        threadId: msg.conversationId,
        from: msg.from?.emailAddress?.address || "",
        fromName: msg.from?.emailAddress?.name,
        to: msg.toRecipients?.[0]?.emailAddress?.address || "",
        subject: msg.subject || "",
        body: msg.body?.content || "",
        contentType: msg.body?.contentType === "html" ? "html" : "text",
        receivedAt: new Date(msg.receivedDateTime),
      }),
    )
  } catch (error) {
    console.error("Outlook fetch error:", error)
    return []
  }
}
