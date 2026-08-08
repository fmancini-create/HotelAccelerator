import { type NextRequest, NextResponse } from "next/server"
import { getChannelAccess, canAccessEmailChannel } from "@/lib/channel-access"
import { getValidGmailToken, gmailFetchWithToken } from "@/lib/gmail-client"
import { EmailProcessor, type InboundEmail } from "@/lib/email/email-processor"
import { parseGmailMessage } from "@/lib/email/gmail-parse"
import type { OAuthProvider } from "@/lib/oauth-config"
import { decryptChannelSecrets } from "@/lib/email/channel-secrets"

const API_VERSION = "v779-base64url-fix"

export async function POST(request: NextRequest) {
  console.log(`[SMART-SYNC] ========== BUILD ${API_VERSION} ==========`)

  try {
    const { channel_id, property_id } = await request.json()
    console.log(`[SMART-SYNC] INPUT: channel_id=${channel_id}, property_id=${property_id}`)

    if (!channel_id || !property_id) {
      console.error("[SMART-SYNC] Missing channel_id or property_id")
      return NextResponse.json({ error: "channel_id e property_id obbligatori" }, { status: 400 })
    }

    const access = await getChannelAccess(request)
    if (!(await canAccessEmailChannel(access, property_id, channel_id))) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }
    const supabase = access.supabase

    const { data: rawChannel, error: channelError } = await supabase
      .from("email_channels")
      .select("*")
      .eq("id", channel_id)
      .eq("property_id", property_id)
      .single()

    if (channelError || !rawChannel) {
      console.error("[SMART-SYNC] Channel not found:", channelError)
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    // DUAL-READ: tollera segreti legacy in chiaro e valori cifrati `enc:v1:...`.
    const channel = decryptChannelSecrets(rawChannel)

    console.log(`[SMART-SYNC] Channel found: provider=${channel.provider}, email=${channel.email_address}`)

    if (!channel.oauth_access_token || !channel.provider) {
      console.error("[SMART-SYNC] Channel not configured with OAuth")
      return NextResponse.json({ error: "Canale non configurato con OAuth" }, { status: 400 })
    }

    const provider = channel.provider as OAuthProvider
    let emails: InboundEmail[] = []

    if (provider === "gmail") {
      console.log("[SMART-SYNC] Fetching Gmail messages...")
      const tokenResult = await getValidGmailToken(channel_id, supabase)
      if (!tokenResult.token) {
        console.error("[SMART-SYNC] Token error:", tokenResult.error)
        return NextResponse.json(
          {
            error: tokenResult.error || "Token non valido",
            code: tokenResult.reconnectRequired ? "GMAIL_RECONNECT_REQUIRED" : "GMAIL_TEMPORARILY_UNAVAILABLE",
          },
          { status: tokenResult.reconnectRequired ? 401 : tokenResult.status === 429 ? 429 : 503 },
        )
      }
      emails = await fetchGmailMessages(tokenResult.token)
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
        } else {
          errors++
        }
      } catch (err) {
        errors++
        console.error(`[SMART-SYNC] Error processing email ${email.externalId}:`, err)
      }
    }

    // This endpoint intentionally samples only the most recent messages for an
    // interactive refresh. It must never advance the durable polling watermark;
    // only the fully paginated cron may do that.

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
    const { data: listData, error: listError, status: listStatus } = await gmailFetchWithToken(
      accessToken,
      "messages?maxResults=50&q=in%3Ainbox",
    )

    if (listError || !listData) {
      if (listStatus === 429) {
        throw new Error("Gmail rate limit exceeded. Riprova tra qualche minuto.")
      }
      throw new Error(listError || `Gmail list HTTP ${listStatus}`)
    }

    if (!listData.messages) return []

    const messages: InboundEmail[] = []
    const messagesToFetch = listData.messages.slice(0, 15)

    for (const msg of messagesToFetch) {
      try {
        const { data: msgData, error: messageError, status: messageStatus } = await gmailFetchWithToken(
          accessToken,
          `messages/${msg.id}?format=full`,
        )

        if (messageStatus === 429) {
          throw new Error("Gmail rate limit exceeded. Riprova tra qualche minuto.")
        }
        if (messageError || !msgData) throw new Error(messageError || `Gmail message HTTP ${messageStatus}`)
        messages.push(parseGmailMessage(msgData))

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
