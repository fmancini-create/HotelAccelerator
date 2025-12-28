// Gmail Thread Detail API - Direct Gmail API source of truth
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken } from "@/lib/gmail-client"

const API_VERSION = "v744"

export async function GET(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  console.log(`[v0] GMAIL THREAD DETAIL API ${API_VERSION} - threadId:`, threadId)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  let channelId: string | null = null

  // First check if user is super_admin
  const { data: adminUser } = await supabase.from("admin_users").select("id, role").eq("id", user.id).single()

  if (adminUser?.role === "super_admin") {
    // Super admin gets access to first active Gmail channel
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .single()

    if (channel) {
      channelId = channel.id
    }
  }

  // Fallback to user_channel_permissions
  if (!channelId) {
    const { data: permission } = await supabase
      .from("user_channel_permissions")
      .select("channel_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (permission) {
      channelId = permission.channel_id
    }
  }

  // Fallback to email_channel_assignments
  if (!channelId) {
    const { data: assignment } = await supabase
      .from("email_channel_assignments")
      .select("channel_id")
      .eq("user_id", user.id)
      .limit(1)
      .single()

    if (assignment) {
      channelId = assignment.channel_id
    }
  }

  if (!channelId) {
    console.log("[v0] No channel found for user:", user.id)
    return NextResponse.json({ error: "Canale Gmail non configurato", debugVersion: API_VERSION }, { status: 404 })
  }

  const { token, error: tokenError } = await getValidGmailToken(channelId)
  if (!token) {
    console.log("[v0] No token for channel:", channelId, tokenError)
    return NextResponse.json(
      { error: tokenError || "Token non disponibile", debugVersion: API_VERSION },
      { status: 401 },
    )
  }

  try {
    // Fetch full thread with all messages
    console.log(`[v0] Fetching thread ${threadId} with format=full`)
    const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!threadRes.ok) {
      const errorBody = await threadRes.text()
      console.error("[v0] Gmail API thread.get error:", threadRes.status, errorBody)
      return NextResponse.json({ error: "Thread non trovato", debugVersion: API_VERSION }, { status: threadRes.status })
    }

    const threadData = await threadRes.json()
    const rawMessages = threadData.messages || []
    console.log(`[v0] Thread has ${rawMessages.length} messages`)

    // Parse each message
    const messages = rawMessages.map((msg: any, idx: number) => {
      const headers = msg.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ""

      let body = ""
      let contentType = "text/plain"
      let bodySource = "none"

      const extractBody = (part: any, depth = 0): { body: string; contentType: string; source: string } | null => {
        const indent = "  ".repeat(depth)
        console.log(
          `[v0] ${indent}Checking part: mimeType=${part.mimeType}, hasData=${!!part.body?.data}, partsCount=${part.parts?.length || 0}`,
        )

        // Direct body data
        if (part.body?.data) {
          try {
            const decoded = Buffer.from(part.body.data, "base64url").toString("utf-8")
            console.log(`[v0] ${indent}Found body data: mimeType=${part.mimeType}, length=${decoded.length}`)
            return { body: decoded, contentType: part.mimeType || "text/plain", source: `direct-${part.mimeType}` }
          } catch (e) {
            console.error(`[v0] ${indent}Error decoding body:`, e)
          }
        }

        // Multipart - search recursively
        if (part.parts && part.parts.length > 0) {
          // Priority 1: text/html
          const htmlPart = part.parts.find((p: any) => p.mimeType === "text/html")
          if (htmlPart) {
            const result = extractBody(htmlPart, depth + 1)
            if (result) return result
          }

          // Priority 2: text/plain
          const textPart = part.parts.find((p: any) => p.mimeType === "text/plain")
          if (textPart) {
            const result = extractBody(textPart, depth + 1)
            if (result) return result
          }

          // Priority 3: multipart/alternative (common for email with both html and plain)
          const altPart = part.parts.find((p: any) => p.mimeType?.startsWith("multipart/"))
          if (altPart) {
            const result = extractBody(altPart, depth + 1)
            if (result) return result
          }

          // Fallback: try any part
          for (const p of part.parts) {
            const result = extractBody(p, depth + 1)
            if (result) return result
          }
        }

        return null
      }

      console.log(`[v0] Message ${idx + 1}/${rawMessages.length} - ID: ${msg.id}`)
      const bodyResult = extractBody(msg.payload)
      if (bodyResult) {
        body = bodyResult.body
        contentType = bodyResult.contentType
        bodySource = bodyResult.source
        console.log(
          `[v0] Message ${msg.id}: body found via ${bodySource}, length=${body.length}, contentType=${contentType}`,
        )
      } else {
        console.log(`[v0] Message ${msg.id}: NO BODY FOUND`)
        // Try snippet as absolute fallback
        if (msg.snippet) {
          body = msg.snippet
          contentType = "text/plain"
          bodySource = "snippet-fallback"
          console.log(`[v0] Message ${msg.id}: using snippet as fallback, length=${body.length}`)
        }
      }

      // Parse From header
      const fromHeader = getHeader("From")
      const fromMatch = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]*)>?$/)
      const senderName = fromMatch?.[1]?.trim() || fromMatch?.[2]?.split("@")[0] || ""
      const senderEmail = fromMatch?.[2] || fromHeader

      // Determine sender type
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
        to: getHeader("To"),
        content: body,
        content_type: contentType,
        snippet: msg.snippet || "",
        sender_type: isSentByMe ? "agent" : "customer",
        isUnread: msg.labelIds?.includes("UNREAD") || false,
        isStarred: msg.labelIds?.includes("STARRED") || false,
        internalDate: Number.parseInt(msg.internalDate),
        // Debug info
        _debug: {
          bodySource,
          bodyLength: body.length,
          contentType,
        },
      }
    })

    // Sort messages by internalDate ascending (oldest first for thread view)
    messages.sort((a: any, b: any) => a.internalDate - b.internalDate)

    // Get thread subject from first message
    const firstMessage = messages[0]
    const subject = firstMessage?.subject || "(nessun oggetto)"

    console.log(`[v0] Returning ${messages.length} messages for thread ${threadId}`)

    return NextResponse.json({
      debugVersion: API_VERSION,
      thread: {
        id: threadId,
        subject,
        messagesCount: messages.length,
        historyId: threadData.historyId,
      },
      messages,
    })
  } catch (error) {
    console.error("[v0] Error fetching thread:", error)
    return NextResponse.json(
      { error: "Errore durante il recupero del thread", debugVersion: API_VERSION },
      { status: 500 },
    )
  }
}
