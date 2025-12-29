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
  getValidGmailToken,
} from "@/lib/gmail-client"

const API_VERSION = "v752-DATA-FIX"

function isInSpam(labels: string[]): boolean {
  return labels.includes("SPAM") || labels.includes("CATEGORY_SPAM")
}

function isInTrash(labels: string[]): boolean {
  return labels.includes("TRASH")
}

async function getEmailChannelForUser(supabase: any, userId: string) {
  const { data: adminUser } = await supabase.from("admin_users").select("id, role").eq("id", userId).single()

  if (adminUser?.role === "super_admin") {
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id, oauth_access_token, oauth_refresh_token, email_address")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .single()
    return channel
  }

  const { data: permission } = await supabase
    .from("user_channel_permissions")
    .select("channel_id, email_channels(id, oauth_access_token, oauth_refresh_token, email_address)")
    .eq("user_id", userId)
    .limit(1)
    .single()

  if (permission?.email_channels) {
    return permission.email_channels
  }

  const { data: assignment } = await supabase
    .from("email_channel_assignments")
    .select("channel_id, email_channels(id, oauth_access_token, oauth_refresh_token, email_address)")
    .eq("user_id", userId)
    .limit(1)
    .single()

  return assignment?.email_channels || null
}

async function verifyThreadExists(
  channelId: string,
  threadId: string,
): Promise<{ exists: boolean; messageIds: string[]; labels: string[]; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { exists: false, messageIds: [], labels: [], error: error || "Token non disponibile" }
  }

  try {
    console.log(`[GMAIL-THREAD-VERIFY] Verifying thread ${threadId} exists...`)

    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 404) {
      console.error(`[GMAIL-THREAD-VERIFY] ❌ INVALID THREAD ID USED: ${threadId} does not exist in Gmail`)
      return { exists: false, messageIds: [], labels: [], error: `Thread ${threadId} non trovato - INVALID THREAD ID` }
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[GMAIL-THREAD-VERIFY] Gmail API error: ${response.status} ${errorBody}`)
      return { exists: false, messageIds: [], labels: [], error: `Gmail API error: ${response.status}` }
    }

    const data = await response.json()
    const messageIds = data.messages?.map((m: any) => m.id) || []

    // Collect all labels from all messages
    const labelsSet = new Set<string>()
    data.messages?.forEach((msg: any) => {
      msg.labelIds?.forEach((label: string) => labelsSet.add(label))
    })
    const labels = Array.from(labelsSet)

    console.log(
      `[GMAIL-THREAD-VERIFY] ✅ Thread ${threadId} verified: messageIds=[${messageIds.join(",")}], labels=[${labels.join(",")}]`,
    )

    return { exists: true, messageIds, labels }
  } catch (err) {
    console.error(`[GMAIL-THREAD-VERIFY] Exception verifying thread ${threadId}:`, err)
    return { exists: false, messageIds: [], labels: [], error: "Errore durante la verifica del thread" }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  console.log(`[GMAIL-THREAD-VERIFY] ========== GMAIL THREAD ACTIONS API ${API_VERSION} ==========`)

  try {
    const { threadId } = await params
    const body = await request.json()
    const { action, currentLabels } = body

    console.log(
      `[GMAIL-THREAD-VERIFY] INPUT: threadId=${threadId}, action=${action}, currentLabels=${JSON.stringify(currentLabels)}`,
    )

    if (!currentLabels || !Array.isArray(currentLabels) || currentLabels.length === 0) {
      console.error(`[GMAIL-THREAD-VERIFY] ❌ HARD BLOCK: currentLabels is empty or invalid`)
      console.error(`[GMAIL-THREAD-VERIFY] INVALID THREAD STATE – LABELS REQUIRED`)
      return NextResponse.json(
        {
          error: "INVALID THREAD STATE – LABELS REQUIRED",
          debugVersion: API_VERSION,
          dataBug: true,
          hint: "Frontend must pass currentLabels array from thread.labels. This is a DATA BUG.",
        },
        { status: 400 },
      )
    }

    if (action === "archive" && isInSpam(currentLabels)) {
      console.error(`[GMAIL-THREAD-VERIFY] ❌ SPAM RULE VIOLATION: Archive attempted on SPAM thread`)
      console.error(`[GMAIL-THREAD-VERIFY] Thread labels: [${currentLabels.join(",")}]`)
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
      console.log("[GMAIL-THREAD-VERIFY] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[GMAIL-THREAD-VERIFY] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-THREAD-VERIFY] Using channel: ${channel.email_address}`)

    const verification = await verifyThreadExists(channel.id, threadId)

    if (!verification.exists) {
      console.error(`[GMAIL-THREAD-VERIFY] ❌ FAIL FAST: Thread verification failed`)
      console.error(`[GMAIL-THREAD-VERIFY] INVALID THREAD ID USED: ${threadId}`)
      return NextResponse.json(
        {
          error: verification.error || "Thread non trovato",
          debugVersion: API_VERSION,
          dataBug: true,
          invalidThreadId: threadId,
        },
        { status: 404 },
      )
    }

    const realLabels = verification.labels
    const messageIds = verification.messageIds

    console.log(`[GMAIL-THREAD-VERIFY] Thread verified successfully`)
    console.log(`[GMAIL-THREAD-VERIFY] Real labels from Gmail: [${realLabels.join(",")}]`)
    console.log(`[GMAIL-THREAD-VERIFY] Message IDs: [${messageIds.join(",")}]`)

    if (messageIds.length === 0) {
      console.error(`[GMAIL-THREAD-VERIFY] ❌ DATA BUG: Thread has no messages`)
      return NextResponse.json(
        {
          error: "Thread non contiene messaggi - DATA BUG",
          debugVersion: API_VERSION,
          dataBug: true,
        },
        { status: 400 },
      )
    }

    let result: { success: boolean; error?: string }
    let labelsRemoved: string[] = []
    let labelsAdded: string[] = []

    switch (action) {
      case "markAsRead":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: markAsRead`)
        result = await markGmailThreadAsRead(channel.id, threadId)
        labelsRemoved = ["UNREAD"]
        break

      case "markAsUnread":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: markAsUnread`)
        result = await markGmailThreadAsUnread(channel.id, threadId)
        labelsAdded = ["UNREAD"]
        break

      case "star":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: star`)
        result = await starGmailThread(channel.id, threadId)
        labelsAdded = ["STARRED"]
        break

      case "unstar":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: unstar`)
        result = await unstarGmailThread(channel.id, threadId)
        labelsRemoved = ["STARRED"]
        break

      case "not_spam": {
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: not_spam - Removing SPAM, adding INBOX`)
        console.log(`[GMAIL-THREAD-VERIFY] Applying to ${messageIds.length} messages`)

        // Apply to ALL messages in thread first
        for (const messageId of messageIds) {
          console.log(`[GMAIL-THREAD-VERIFY] messages.modify ${messageId}: -SPAM,-CATEGORY_SPAM +INBOX`)
          await modifyGmailMessage(channel.id, messageId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        }

        // Then apply at thread level
        console.log(`[GMAIL-THREAD-VERIFY] threads.modify ${threadId}: -SPAM,-CATEGORY_SPAM +INBOX`)
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break
      }

      case "archive": {
        // SPAM case already blocked above (FIX #5)
        const threadIsInTrash = isInTrash(realLabels)

        if (threadIsInTrash) {
          console.log(`[GMAIL-THREAD-VERIFY] ACTION: archive from TRASH - using untrash`)
          result = await untrashGmailThread(channel.id, threadId)
          labelsRemoved = ["TRASH"]
        } else {
          console.log(`[GMAIL-THREAD-VERIFY] ACTION: archive - removing INBOX label`)
          result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          labelsRemoved = ["INBOX"]
        }
        break
      }

      case "trash":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: trash`)
        result = await trashGmailThread(channel.id, threadId)
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break

      case "untrash":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: untrash`)
        result = await untrashGmailThread(channel.id, threadId)
        labelsRemoved = ["TRASH"]
        break

      case "spam":
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: spam`)
        result = await spamGmailThread(channel.id, threadId)
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break

      case "unspam":
        // Legacy alias for not_spam
        console.log(`[GMAIL-THREAD-VERIFY] ACTION: unspam (legacy) -> not_spam`)
        for (const messageId of messageIds) {
          await modifyGmailMessage(channel.id, messageId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        }
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break

      default:
        console.error(`[GMAIL-THREAD-VERIFY] Unknown action: ${action}`)
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-THREAD-VERIFY] ========== ACTION RESULT ==========`)
    console.log(`[GMAIL-THREAD-VERIFY] Success: ${result.success}`)
    console.log(`[GMAIL-THREAD-VERIFY] Labels REMOVED: [${labelsRemoved.join(",")}]`)
    console.log(`[GMAIL-THREAD-VERIFY] Labels ADDED: [${labelsAdded.join(",")}]`)

    if (!result.success) {
      console.error(`[GMAIL-THREAD-VERIFY] ❌ Action FAILED: ${result.error}`)

      if (result.error?.includes("404")) {
        console.error(`[GMAIL-THREAD-VERIFY] INVALID THREAD ID USED - This is a DATA BUG`)
        return NextResponse.json(
          {
            error: result.error,
            debugVersion: API_VERSION,
            dataBug: true,
          },
          { status: 404 },
        )
      }

      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[GMAIL-THREAD-VERIFY] ✅ Action "${action}" SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      action,
      labelsRemoved,
      labelsAdded,
      verification: {
        messageCount: messageIds.length,
        realLabels: realLabels,
      },
    })
  } catch (error) {
    console.error("[GMAIL-THREAD-VERIFY] Exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
