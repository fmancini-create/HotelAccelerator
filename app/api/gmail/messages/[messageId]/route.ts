import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  markGmailAsRead,
  markGmailAsUnread,
  starGmailMessage,
  unstarGmailMessage,
  archiveGmailMessage,
  trashGmailMessage,
  untrashGmailMessage,
  spamGmailMessage,
  modifyGmailMessage,
} from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"
import { decryptChannelSecrets } from "@/lib/email/channel-secrets"

const API_VERSION = "v744"

async function getEmailChannelForUser(supabase: any, userId: string, requestedChannelId?: string | null) {
  const { channelId } = await resolveGmailChannelId(supabase, userId, requestedChannelId)
  if (!channelId) return null
  const { data: channel } = await supabase
    .from("email_channels")
    .select("id, oauth_access_token, oauth_refresh_token, email_address")
    .eq("id", channelId)
    .maybeSingle()
  // DUAL-READ: tollera segreti legacy in chiaro e valori cifrati `enc:v1:...`.
  return decryptChannelSecrets(channel)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  console.log(`[v0] GMAIL MESSAGE ACTION API ${API_VERSION} HIT`)

  try {
    const { messageId } = await params
    const body = await request.json()
    const { action, addLabels, removeLabels, channelId: requestedChannelId } = body

    console.log(`[v0] Action: ${action}, messageId: ${messageId}`)

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id, requestedChannelId)

    if (!channel) {
      console.log("[v0] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[v0] Using channel: ${channel.email_address}`)

    let result: { success: boolean; error?: string }

    switch (action) {
      case "markAsRead":
        result = await markGmailAsRead(channel.id, messageId)
        break
      case "markAsUnread":
        result = await markGmailAsUnread(channel.id, messageId)
        break
      case "star":
        result = await starGmailMessage(channel.id, messageId)
        break
      case "unstar":
        result = await unstarGmailMessage(channel.id, messageId)
        break
      case "archive":
        result = await archiveGmailMessage(channel.id, messageId)
        break
      case "trash":
        result = await trashGmailMessage(channel.id, messageId)
        break
      case "untrash":
        result = await untrashGmailMessage(channel.id, messageId)
        break
      case "spam":
        result = await spamGmailMessage(channel.id, messageId)
        break
      case "modifyLabels":
        result = await modifyGmailMessage(channel.id, messageId, addLabels || [], removeLabels || [])
        break
      default:
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    if (!result.success) {
      console.log(`[v0] Gmail action failed: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[v0] Gmail action ${action} successful`)

    // Update local DB cache after successful Gmail API call
    if (action === "markAsRead") {
      await supabase.from("messages").update({ status: "read" }).eq("gmail_id", messageId)
    } else if (action === "markAsUnread") {
      await supabase.from("messages").update({ status: "received" }).eq("gmail_id", messageId)
    } else if (action === "star" || action === "unstar") {
      const { data: message } = await supabase
        .from("messages")
        .select("conversation_id")
        .eq("gmail_id", messageId)
        .single()

      if (message) {
        await supabase
          .from("conversations")
          .update({ is_starred: action === "star" })
          .eq("id", message.conversation_id)
      }
    } else if (action === "archive" || action === "trash" || action === "spam") {
      const { data: message } = await supabase
        .from("messages")
        .select("id, gmail_labels")
        .eq("gmail_id", messageId)
        .single()

      if (message) {
        const newLabels = (message.gmail_labels || []).filter((l: string) => l !== "INBOX")
        if (action === "trash") newLabels.push("TRASH")
        if (action === "spam") newLabels.push("SPAM")

        await supabase.from("messages").update({ gmail_labels: newLabels }).eq("id", message.id)
      }
    }

    return NextResponse.json({ success: true, debugVersion: API_VERSION })
  } catch (error) {
    console.error("[v0] Gmail message action error:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
