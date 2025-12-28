import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()
    const { action, addLabels, removeLabels } = body

    const supabase = await createClient()

    // Get default email channel
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("id")
      .eq("property_id", propertyId)
      .eq("is_default", true)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ error: "Canale email non configurato" }, { status: 400 })
    }

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
        return NextResponse.json({ error: "Azione non valida" }, { status: 400 })
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Update local DB cache after successful Gmail API call
    if (action === "markAsRead") {
      await supabase.from("messages").update({ status: "read" }).eq("gmail_id", messageId)
    } else if (action === "markAsUnread") {
      await supabase.from("messages").update({ status: "received" }).eq("gmail_id", messageId)
    } else if (action === "star" || action === "unstar") {
      // Update conversation star status
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
      // Update gmail_labels in messages
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Gmail message action error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
