import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  markGmailThreadAsRead,
  markGmailThreadAsUnread,
  starGmailThread,
  unstarGmailThread,
  trashGmailThread,
  spamGmailThread,
  untrashGmailThread,
  modifyGmailThread,
  modifyGmailMessage,
  getGmailThreadMessages,
} from "@/lib/gmail-client"

const API_VERSION = "v750-FINAL-SPAM-FIX"

function isInSpam(labels: string[]): boolean {
  return labels.includes("SPAM") || labels.includes("CATEGORY_SPAM")
}

function isInTrash(labels: string[]): boolean {
  return labels.includes("TRASH")
}

async function getEmailChannelForUser(supabase: any, userId: string) {
  // Check if user is super_admin
  const { data: adminUser } = await supabase.from("admin_users").select("id, role").eq("id", userId).single()

  if (adminUser?.role === "super_admin") {
    // Super admin: get first active Gmail channel
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id, oauth_access_token, oauth_refresh_token, email_address")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .single()
    return channel
  }

  // Check user_channel_permissions
  const { data: permission } = await supabase
    .from("user_channel_permissions")
    .select("channel_id, email_channels(id, oauth_access_token, oauth_refresh_token, email_address)")
    .eq("user_id", userId)
    .limit(1)
    .single()

  if (permission?.email_channels) {
    return permission.email_channels
  }

  // Check email_channel_assignments
  const { data: assignment } = await supabase
    .from("email_channel_assignments")
    .select("channel_id, email_channels(id, oauth_access_token, oauth_refresh_token, email_address)")
    .eq("user_id", userId)
    .limit(1)
    .single()

  return assignment?.email_channels || null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  console.log(`[GMAIL] ========== GMAIL THREAD ACTIONS API ${API_VERSION} ==========`)

  try {
    const { threadId } = await params
    const body = await request.json()
    const { action, currentLabels } = body

    const labelsForLogging = currentLabels || []
    console.log(`[GMAIL] Action: ${action}`)
    console.log(`[GMAIL] Thread ID: ${threadId}`)
    console.log(`[GMAIL] Current Labels: ${JSON.stringify(labelsForLogging)}`)

    if (action === "archive" && isInSpam(labelsForLogging)) {
      console.warn(`[GMAIL] ⚠️ Archive BLOCKED: thread is in SPAM. Use "not_spam" action instead.`)
      return NextResponse.json(
        {
          error: "Archive non disponibile per messaggi SPAM. Usa 'Non è spam' per spostare in Posta in arrivo.",
          debugVersion: API_VERSION,
          blocked: true,
          suggestion: "not_spam",
        },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[GMAIL] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[GMAIL] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL] Using channel: ${channel.email_address}`)

    let result: { success: boolean; error?: string }
    let labelsRemoved: string[] = []
    let labelsAdded: string[] = []

    switch (action) {
      case "markAsRead":
        console.log(`[GMAIL] ACTION: markAsRead - removing UNREAD label`)
        result = await markGmailThreadAsRead(channel.id, threadId)
        labelsRemoved = ["UNREAD"]
        break

      case "markAsUnread":
        console.log(`[GMAIL] ACTION: markAsUnread - adding UNREAD label`)
        result = await markGmailThreadAsUnread(channel.id, threadId)
        labelsAdded = ["UNREAD"]
        break

      case "star":
        console.log(`[GMAIL] ACTION: star - adding STARRED label`)
        result = await starGmailThread(channel.id, threadId)
        labelsAdded = ["STARRED"]
        break

      case "unstar":
        console.log(`[GMAIL] ACTION: unstar - removing STARRED label`)
        result = await unstarGmailThread(channel.id, threadId)
        labelsRemoved = ["STARRED"]
        break

      case "not_spam": {
        console.log(`[GMAIL] ACTION: not_spam - removing SPAM, adding INBOX (replicate Gmail Web)`)

        // Get all message IDs in thread for comprehensive spam removal
        const { messageIds, error: fetchError } = await getGmailThreadMessages(channel.id, threadId)

        if (fetchError) {
          console.warn(`[GMAIL] Warning fetching messages: ${fetchError}`)
        }

        // Apply to ALL messages in thread
        if (messageIds && messageIds.length > 0) {
          console.log(`[GMAIL] Applying not_spam to ${messageIds.length} messages`)
          for (const messageId of messageIds) {
            console.log(`[GMAIL] messages.modify ${messageId}: remove SPAM/CATEGORY_SPAM, add INBOX`)
            await modifyGmailMessage(channel.id, messageId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
          }
        }

        // Also apply at thread level for good measure
        console.log(`[GMAIL] threads.modify: remove SPAM/CATEGORY_SPAM, add INBOX`)
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break
      }

      case "archive": {
        // Note: SPAM case already blocked above
        const threadIsInTrash = isInTrash(labelsForLogging)

        if (threadIsInTrash) {
          console.log(`[GMAIL] ACTION: archive from TRASH - using untrash`)
          result = await untrashGmailThread(channel.id, threadId)
          labelsRemoved = ["TRASH"]
        } else {
          // Normal archive - just remove INBOX
          console.log(`[GMAIL] ACTION: normal archive - removing INBOX label`)
          result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          labelsRemoved = ["INBOX"]
        }
        break
      }

      case "trash":
        console.log(`[GMAIL] ACTION: trash - moving to trash`)
        result = await trashGmailThread(channel.id, threadId)
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break

      case "untrash":
        console.log(`[GMAIL] ACTION: untrash - restoring from trash`)
        result = await untrashGmailThread(channel.id, threadId)
        labelsRemoved = ["TRASH"]
        break

      case "spam":
        console.log(`[GMAIL] ACTION: spam - adding SPAM, removing INBOX`)
        result = await spamGmailThread(channel.id, threadId)
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break

      case "unspam":
        // Legacy alias for not_spam
        console.log(`[GMAIL] ACTION: unspam (legacy) - redirecting to not_spam logic`)
        const { messageIds: msgIds } = await getGmailThreadMessages(channel.id, threadId)
        if (msgIds && msgIds.length > 0) {
          for (const messageId of msgIds) {
            await modifyGmailMessage(channel.id, messageId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
          }
        }
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break

      default:
        console.error(`[GMAIL] Unknown action: ${action}`)
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL] ========== ACTION COMPLETE ==========`)
    console.log(`[GMAIL] Labels REMOVED: ${JSON.stringify(labelsRemoved)}`)
    console.log(`[GMAIL] Labels ADDED: ${JSON.stringify(labelsAdded)}`)

    if (!result.success) {
      console.error(`[GMAIL] ❌ Action FAILED: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[GMAIL] ✅ Action "${action}" SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      action,
      labelsRemoved,
      labelsAdded,
    })
  } catch (error) {
    console.error("[GMAIL] Exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
