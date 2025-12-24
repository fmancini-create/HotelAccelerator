import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { OAuthProvider } from "@/lib/oauth-config"

// Send email via OAuth (Gmail or Outlook API)
export async function POST(request: NextRequest) {
  try {
    const { channel_id, property_id, to, subject, body, reply_to_message_id } = await request.json()

    if (!channel_id || !property_id || !to || !body) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get channel with OAuth credentials
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

    // Check token expiry and refresh if needed
    if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
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

      // Re-fetch channel
      const { data: refreshedChannel } = await supabase
        .from("email_channels")
        .select("oauth_access_token")
        .eq("id", channel_id)
        .single()

      channel.oauth_access_token = refreshedChannel?.oauth_access_token
    }

    const provider = channel.provider as OAuthProvider
    let sendResult: any

    if (provider === "gmail") {
      sendResult = await sendGmailMessage(
        channel.oauth_access_token,
        channel.email_address,
        channel.display_name || channel.name,
        to,
        subject,
        body,
        reply_to_message_id,
      )
    } else if (provider === "outlook") {
      sendResult = await sendOutlookMessage(channel.oauth_access_token, to, subject, body)
    }

    if (!sendResult.success) {
      return NextResponse.json({ error: sendResult.error || "Errore invio email" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: sendResult.messageId,
    })
  } catch (error) {
    console.error("OAuth send error:", error)
    return NextResponse.json({ error: "Errore durante l'invio" }, { status: 500 })
  }
}

async function sendGmailMessage(
  accessToken: string,
  from: string,
  fromName: string,
  to: string,
  subject: string,
  body: string,
  replyToMessageId?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Build RFC 2822 message
    const messageParts = [
      `From: "${fromName}" <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ]

    const message = messageParts.join("\r\n")
    const encodedMessage = Buffer.from(message).toString("base64url")

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
        ...(replyToMessageId && { threadId: replyToMessageId }),
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: errorData.error?.message || "Gmail API error" }
    }

    const data = await response.json()
    return { success: true, messageId: data.id }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function sendOutlookMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "Text",
            content: body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, error: errorData.error?.message || "Outlook API error" }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
