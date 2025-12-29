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

const API_VERSION = "v774-backend-label-authority"

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

async function getThreadLabelsFromGmail(
  channelId: string,
  threadId: string,
): Promise<{ success: boolean; messageIds: string[]; labels: string[]; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, messageIds: [], labels: [], error: error || "Token non disponibile" }
  }

  try {
    console.log(`[GMAIL-BACKEND-LABELS] Fetching labels for thread ${threadId} from Gmail API...`)

    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 404) {
      console.error(`[GMAIL-BACKEND-LABELS] Thread ${threadId} NOT FOUND in Gmail`)
      return { success: false, messageIds: [], labels: [], error: `Thread ${threadId} non trovato` }
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[GMAIL-BACKEND-LABELS] Gmail API error: ${response.status} ${errorBody}`)
      return { success: false, messageIds: [], labels: [], error: `Gmail API error: ${response.status}` }
    }

    const data = await response.json()
    const messageIds = data.messages?.map((m: any) => m.id) || []

    // Collect ALL labels from ALL messages in thread
    const labelsSet = new Set<string>()
    data.messages?.forEach((msg: any) => {
      msg.labelIds?.forEach((label: string) => labelsSet.add(label))
    })
    const labels = Array.from(labelsSet)

    console.log(`[GMAIL-BACKEND-LABELS] threadId=${threadId}`)
    console.log(`[GMAIL-BACKEND-LABELS] labelsFromGmail=[${labels.join(",")}]`)
    console.log(`[GMAIL-BACKEND-LABELS] messageIds=[${messageIds.join(",")}]`)

    return { success: true, messageIds, labels }
  } catch (err) {
    console.error(`[GMAIL-BACKEND-LABELS] Exception:`, err)
    return { success: false, messageIds: [], labels: [], error: "Errore durante il fetch delle labels" }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  console.log(`[GMAIL-ACTIONS] ========== BUILD ${API_VERSION} ==========`)

  try {
    const { threadId } = await params
    const body = await request.json()

    const { action } = body

    console.log(`[GMAIL-ACTIONS] INPUT: threadId=${threadId}, action=${action}`)
    console.log(`[GMAIL-ACTIONS] NOTE: Labels will be fetched from Gmail (backend authority)`)

    // Validate action
    const validActions = [
      "star",
      "unstar",
      "trash",
      "archive",
      "not_spam",
      "unspam",
      "spam",
      "untrash",
      "markAsRead",
      "markAsUnread",
    ]
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[GMAIL-ACTIONS] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[GMAIL-ACTIONS] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-ACTIONS] Using channel: ${channel.email_address}`)

    const gmailData = await getThreadLabelsFromGmail(channel.id, threadId)

    if (!gmailData.success) {
      console.error(`[GMAIL-ACTIONS] Failed to fetch thread labels from Gmail`)
      return NextResponse.json(
        {
          error: gmailData.error || "Thread non trovato",
          debugVersion: API_VERSION,
        },
        { status: 404 },
      )
    }

    const labels = gmailData.labels
    const messageIds = gmailData.messageIds

    console.log(`[GMAIL-ACTIONS] AUTHORITATIVE labels from Gmail: [${labels.join(",")}]`)

    if (action === "archive" && isInSpam(labels)) {
      console.error(`[GMAIL-ACTIONS] SPAM RULE: Archive blocked on SPAM thread`)
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

    let result: { success: boolean; error?: string }
    let labelsRemoved: string[] = []
    let labelsAdded: string[] = []

    switch (action) {
      case "markAsRead":
        console.log(`[GMAIL-ACTIONS] Executing: markAsRead`)
        result = await markGmailThreadAsRead(channel.id, threadId)
        labelsRemoved = ["UNREAD"]
        break

      case "markAsUnread":
        console.log(`[GMAIL-ACTIONS] Executing: markAsUnread`)
        result = await markGmailThreadAsUnread(channel.id, threadId)
        labelsAdded = ["UNREAD"]
        break

      case "star":
        console.log(`[GMAIL-ACTIONS] Executing: star`)
        result = await starGmailThread(channel.id, threadId)
        labelsAdded = ["STARRED"]
        break

      case "unstar":
        console.log(`[GMAIL-ACTIONS] Executing: unstar`)
        result = await unstarGmailThread(channel.id, threadId)
        labelsRemoved = ["STARRED"]
        break

      case "not_spam":
      case "unspam": {
        console.log(`[GMAIL-ACTIONS] Executing: not_spam`)
        console.log(`[GMAIL-ACTIONS] Applying to ${messageIds.length} messages`)

        // Apply to ALL messages in thread first
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTIONS] messages.modify ${messageId}: -SPAM,-CATEGORY_SPAM +INBOX`)
          await modifyGmailMessage(channel.id, messageId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        }

        // Then apply at thread level
        console.log(`[GMAIL-ACTIONS] threads.modify ${threadId}: -SPAM,-CATEGORY_SPAM +INBOX`)
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break
      }

      case "archive": {
        // Backend determines correct action based on Gmail labels
        if (isInTrash(labels)) {
          console.log(`[GMAIL-ACTIONS] Executing: archive from TRASH -> untrash`)
          result = await untrashGmailThread(channel.id, threadId)
          labelsRemoved = ["TRASH"]
        } else {
          console.log(`[GMAIL-ACTIONS] Executing: archive -> remove INBOX`)
          result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          labelsRemoved = ["INBOX"]
        }
        break
      }

      case "trash":
        console.log(`[GMAIL-ACTIONS] Executing: trash`)
        result = await trashGmailThread(channel.id, threadId)
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break

      case "untrash":
        console.log(`[GMAIL-ACTIONS] Executing: untrash`)
        result = await untrashGmailThread(channel.id, threadId)
        labelsRemoved = ["TRASH"]
        break

      case "spam":
        console.log(`[GMAIL-ACTIONS] Executing: spam`)
        result = await spamGmailThread(channel.id, threadId)
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break

      default:
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-ACTIONS] ========== RESULT ==========`)
    console.log(`[GMAIL-ACTIONS] Success: ${result.success}`)
    console.log(`[GMAIL-ACTIONS] Labels REMOVED: [${labelsRemoved.join(",")}]`)
    console.log(`[GMAIL-ACTIONS] Labels ADDED: [${labelsAdded.join(",")}]`)

    if (!result.success) {
      console.error(`[GMAIL-ACTIONS] Action FAILED: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[GMAIL-ACTIONS] Action "${action}" SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      action,
      labelsRemoved,
      labelsAdded,
      gmailLabels: labels,
    })
  } catch (error) {
    console.error("[GMAIL-ACTIONS] Exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
