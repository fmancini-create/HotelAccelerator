// Gmail Thread Detail API - Direct Gmail API source of truth
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

export async function GET(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  // Get user's property
  const { data: propertyUser } = await supabase
    .from("property_users")
    .select("property_id")
    .eq("user_id", user.id)
    .single()

  if (!propertyUser) {
    return NextResponse.json({ error: "Property non trovata" }, { status: 404 })
  }

  // Get email channel
  const { data: channel } = await supabase
    .from("email_channels")
    .select("id")
    .eq("property_id", propertyUser.property_id)
    .eq("provider", "gmail")
    .eq("is_active", true)
    .single()

  if (!channel) {
    return NextResponse.json({ error: "Canale Gmail non configurato" }, { status: 404 })
  }

  const { token, error: tokenError } = await getValidGmailToken(channel.id)
  if (!token) {
    return NextResponse.json({ error: tokenError || "Token non disponibile" }, { status: 401 })
  }

  try {
    // Fetch full thread with all messages
    const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!threadRes.ok) {
      const errorBody = await threadRes.text()
      console.error("[Gmail API] thread.get error:", threadRes.status, errorBody)
      return NextResponse.json({ error: "Thread non trovato" }, { status: threadRes.status })
    }

    const threadData = await threadRes.json()
    const rawMessages = threadData.messages || []

    // Parse each message
    const messages = rawMessages.map((msg: any) => {
      const headers = msg.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

      // Extract body content
      let body = ""
      let contentType = "text/plain"

      const extractBody = (part: any): { body: string; contentType: string } | null => {
        if (part.body?.data) {
          const decoded = Buffer.from(part.body.data, "base64url").toString("utf-8")
          return { body: decoded, contentType: part.mimeType || "text/plain" }
        }
        if (part.parts) {
          // Prefer HTML over plain text
          const htmlPart = part.parts.find((p: any) => p.mimeType === "text/html")
          if (htmlPart) {
            const result = extractBody(htmlPart)
            if (result) return result
          }
          const textPart = part.parts.find((p: any) => p.mimeType === "text/plain")
          if (textPart) {
            const result = extractBody(textPart)
            if (result) return result
          }
          // Try first part recursively
          for (const p of part.parts) {
            const result = extractBody(p)
            if (result) return result
          }
        }
        return null
      }

      const bodyResult = extractBody(msg.payload)
      if (bodyResult) {
        body = bodyResult.body
        contentType = bodyResult.contentType
      }

      // Parse From header
      const fromHeader = getHeader("From")
      const fromMatch = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]*)>?$/)
      const senderName = fromMatch?.[1]?.trim() || fromMatch?.[2]?.split("@")[0] || ""
      const senderEmail = fromMatch?.[2] || fromHeader

      // Determine sender type (agent if sent by us, customer otherwise)
      const toHeader = getHeader("To")
      const isSentByMe = msg.labelIds?.includes("SENT") || false

      return {
        id: msg.id,
        gmail_id: msg.id,
        gmail_thread_id: msg.threadId,
        gmail_labels: msg.labelIds || [],
        gmail_internal_date: new Date(Number.parseInt(msg.internalDate)).toISOString(),
        subject: getHeader("Subject") || "(nessun oggetto)",
        from: {
          name: senderName,
          email: senderEmail,
        },
        to: toHeader,
        content: body,
        content_type: contentType,
        snippet: msg.snippet || "",
        sender_type: isSentByMe ? "agent" : "customer",
        isUnread: msg.labelIds?.includes("UNREAD") || false,
        isStarred: msg.labelIds?.includes("STARRED") || false,
        internalDate: Number.parseInt(msg.internalDate),
      }
    })

    // Sort messages by internalDate ascending (oldest first for thread view)
    messages.sort((a: any, b: any) => a.internalDate - b.internalDate)

    // Get thread subject from first message
    const firstMessage = messages[0]
    const subject = firstMessage?.subject || "(nessun oggetto)"

    return NextResponse.json({
      thread: {
        id: threadId,
        subject,
        messagesCount: messages.length,
        historyId: threadData.historyId,
      },
      messages,
    })
  } catch (error) {
    console.error("[Gmail API] Error fetching thread:", error)
    return NextResponse.json({ error: "Errore durante il recupero del thread" }, { status: 500 })
  }
}
