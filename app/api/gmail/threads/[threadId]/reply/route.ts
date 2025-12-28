// Gmail Thread Reply API - Send reply to a thread
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  console.log("[v0] GMAIL REPLY API - threadId:", threadId)

  try {
    const body = await request.json()
    const { content, to, subject } = body

    if (!content) {
      return NextResponse.json({ error: "Contenuto mancante" }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    let channelId: string | null = null
    let channelData: any = null

    // First check if user is super_admin
    const { data: adminUser } = await supabase.from("admin_users").select("id, role").eq("id", user.id).single()

    if (adminUser?.role === "super_admin") {
      const { data: channel } = await supabase
        .from("email_channels")
        .select("id, email_address, display_name, name")
        .eq("provider", "gmail")
        .eq("is_active", true)
        .limit(1)
        .single()

      if (channel) {
        channelId = channel.id
        channelData = channel
      }
    }

    // Fallback to user_channel_permissions
    if (!channelId) {
      const { data: permission } = await supabase
        .from("user_channel_permissions")
        .select("channel_id, email_channels(id, email_address, display_name, name)")
        .eq("user_id", user.id)
        .limit(1)
        .single()

      if (permission) {
        channelId = permission.channel_id
        channelData = permission.email_channels
      }
    }

    if (!channelId || !channelData) {
      return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })
    }

    const { token, error: tokenError } = await getValidGmailToken(channelId)
    if (!token) {
      return NextResponse.json({ error: tokenError || "Token non disponibile" }, { status: 401 })
    }

    // Get thread info to get the original message details for reply
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!threadRes.ok) {
      const errorBody = await threadRes.text()
      console.error("[v0] Gmail API thread.get error:", errorBody)
      return NextResponse.json({ error: "Thread non trovato" }, { status: 404 })
    }

    const threadData = await threadRes.json()
    const lastMessage = threadData.messages?.[threadData.messages.length - 1]

    if (!lastMessage) {
      return NextResponse.json({ error: "Nessun messaggio nel thread" }, { status: 400 })
    }

    // Extract headers from last message
    const headers = lastMessage.payload?.headers || []
    const getHeader = (name: string) =>
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

    const originalFrom = getHeader("From")
    const originalSubject = getHeader("Subject")
    const originalMessageId = getHeader("Message-ID")

    // Parse original sender email
    const fromMatch = originalFrom.match(/<([^>]+)>/)
    const replyTo = to || (fromMatch ? fromMatch[1] : originalFrom)

    // Build reply subject
    const replySubject = subject || (originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`)

    // Build RFC 2822 message with proper headers for threading
    const fromAddress = channelData.email_address
    const fromName = channelData.display_name || channelData.name || fromAddress.split("@")[0]

    const messageParts = [
      `From: "${fromName}" <${fromAddress}>`,
      `To: ${replyTo}`,
      `Subject: ${replySubject}`,
      `In-Reply-To: ${originalMessageId}`,
      `References: ${originalMessageId}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      `<div style="font-family: Arial, sans-serif; font-size: 14px;">${content.replace(/\n/g, "<br>")}</div>`,
    ]

    const message = messageParts.join("\r\n")
    const encodedMessage = Buffer.from(message).toString("base64url")

    console.log("[v0] Sending reply to:", replyTo, "subject:", replySubject)

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
        threadId: threadId,
      }),
    })

    if (!sendRes.ok) {
      const errorData = await sendRes.json()
      console.error("[v0] Gmail send error:", errorData)
      return NextResponse.json({ error: errorData.error?.message || "Errore invio email" }, { status: 500 })
    }

    const sendData = await sendRes.json()
    console.log("[v0] Email sent successfully, messageId:", sendData.id)

    return NextResponse.json({
      success: true,
      messageId: sendData.id,
      threadId: sendData.threadId,
    })
  } catch (error) {
    console.error("[v0] Gmail reply error:", error)
    return NextResponse.json({ error: "Errore durante l'invio" }, { status: 500 })
  }
}
