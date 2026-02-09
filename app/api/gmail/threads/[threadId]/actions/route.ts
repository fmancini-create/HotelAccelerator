import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { modifyGmailMessage, getValidGmailToken } from "@/lib/gmail-client"

const API_VERSION = "v778-message-id-fix"

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

async function getThreadData(
  channelId: string,
  threadId: string,
): Promise<{ success: boolean; messageIds: string[]; labels: string[]; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, messageIds: [], labels: [], error: error || "Token non disponibile" }
  }

  try {
    console.log(`[GMAIL-ACTION] Fetching thread ${threadId} from Gmail API...`)

    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 404) {
      console.error(`[GMAIL-ACTION] Thread ${threadId} NOT FOUND in Gmail`)
      return { success: false, messageIds: [], labels: [], error: `Thread ${threadId} non trovato` }
    }

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[GMAIL-ACTION] Gmail API error: ${response.status} ${errorBody}`)
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

    console.log(
      `[GMAIL-ACTION] threadId=${threadId}, messageIds=[${messageIds.join(",")}], labels=[${labels.join(",")}]`,
    )

    return { success: true, messageIds, labels }
  } catch (err) {
    console.error(`[GMAIL-ACTION] Exception:`, err)
    return { success: false, messageIds: [], labels: [], error: "Errore durante il fetch delle labels" }
  }
}

async function trashGmailMessage(channelId: string, messageId: string): Promise<{ success: boolean; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, error: error || "Token non disponibile" }
  }

  try {
    console.log(`[GMAIL-ACTION] Trashing message ${messageId}`)
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[GMAIL-ACTION] Trash error: ${response.status} ${errorBody}`)
      return { success: false, error: `Gmail API error: ${response.status}` }
    }

    console.log(`[GMAIL-ACTION] Message ${messageId} trashed successfully`)
    return { success: true }
  } catch (err) {
    console.error(`[GMAIL-ACTION] Trash exception:`, err)
    return { success: false, error: "Errore durante lo spostamento nel cestino" }
  }
}

async function untrashGmailMessage(
  channelId: string,
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const { token, error } = await getValidGmailToken(channelId)

  if (!token) {
    return { success: false, error: error || "Token non disponibile" }
  }

  try {
    console.log(`[GMAIL-ACTION] Untrashing message ${messageId}`)
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/untrash`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[GMAIL-ACTION] Untrash error: ${response.status} ${errorBody}`)
      return { success: false, error: `Gmail API error: ${response.status}` }
    }

    console.log(`[GMAIL-ACTION] Message ${messageId} untrashed successfully`)
    return { success: true }
  } catch (err) {
    console.error(`[GMAIL-ACTION] Untrash exception:`, err)
    return { success: false, error: "Errore durante il ripristino" }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  console.log(`[GMAIL-ACTION] ========== BUILD ${API_VERSION} ==========`)

  try {
    const { threadId } = await params
    const body = await request.json()
    const { action } = body

    console.log(`[GMAIL-ACTION] INPUT: threadId=${threadId}, action=${action}`)

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
      console.log("[GMAIL-ACTION] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[GMAIL-ACTION] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-ACTION] Using channel: ${channel.email_address}`)

    const threadData = await getThreadData(channel.id, threadId)

    if (!threadData.success || threadData.messageIds.length === 0) {
      console.error(`[GMAIL-ACTION] Failed to fetch thread data`)
      return NextResponse.json(
        { error: threadData.error || "Thread non trovato", debugVersion: API_VERSION },
        { status: 404 },
      )
    }

    const { messageIds, labels } = threadData

    console.log(`[GMAIL-ACTION] Found ${messageIds.length} messages in thread`)
    console.log(`[GMAIL-ACTION] Labels from Gmail: [${labels.join(",")}]`)

    // Block archive on SPAM
    if (action === "archive" && isInSpam(labels)) {
      console.error(`[GMAIL-ACTION] SPAM RULE: Archive blocked on SPAM thread`)
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

    let result: { success: boolean; error?: string } = { success: true }
    let labelsRemoved: string[] = []
    let labelsAdded: string[] = []

    switch (action) {
      case "markAsRead":
        console.log(`[GMAIL-ACTION] Executing: markAsRead on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTION] messages.modify ${messageId}: -UNREAD`)
          const r = await modifyGmailMessage(channel.id, messageId, [], ["UNREAD"])
          if (!r.success) result = r
        }
        labelsRemoved = ["UNREAD"]
        break

      case "markAsUnread":
        console.log(`[GMAIL-ACTION] Executing: markAsUnread on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTION] messages.modify ${messageId}: +UNREAD`)
          const r = await modifyGmailMessage(channel.id, messageId, ["UNREAD"], [])
          if (!r.success) result = r
        }
        labelsAdded = ["UNREAD"]
        break

      case "star":
        console.log(`[GMAIL-ACTION] Executing: star on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTION] messages.modify ${messageId}: +STARRED`)
          const r = await modifyGmailMessage(channel.id, messageId, ["STARRED"], [])
          if (!r.success) result = r
        }
        labelsAdded = ["STARRED"]
        break

      case "unstar":
        console.log(`[GMAIL-ACTION] Executing: unstar on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTION] messages.modify ${messageId}: -STARRED`)
          const r = await modifyGmailMessage(channel.id, messageId, [], ["STARRED"])
          if (!r.success) result = r
        }
        labelsRemoved = ["STARRED"]
        break

      case "not_spam":
      case "unspam":
        console.log(`[GMAIL-ACTION] Executing: not_spam on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTION] messages.modify ${messageId}: -SPAM,-CATEGORY_SPAM +INBOX`)
          const r = await modifyGmailMessage(channel.id, messageId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
          if (!r.success) result = r
        }
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break

      case "archive":
        if (isInTrash(labels)) {
          console.log(`[GMAIL-ACTION] Executing: archive from TRASH -> untrash on ${messageIds.length} messages`)
          for (const messageId of messageIds) {
            const r = await untrashGmailMessage(channel.id, messageId)
            if (!r.success) result = r
          }
          labelsRemoved = ["TRASH"]
        } else {
          console.log(`[GMAIL-ACTION] Executing: archive -> remove INBOX on ${messageIds.length} messages`)
          for (const messageId of messageIds) {
            console.log(`[GMAIL-ACTION] messages.modify ${messageId}: -INBOX`)
            const r = await modifyGmailMessage(channel.id, messageId, [], ["INBOX"])
            if (!r.success) result = r
          }
          labelsRemoved = ["INBOX"]
        }
        break

      case "trash":
        console.log(`[GMAIL-ACTION] Executing: trash on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          const r = await trashGmailMessage(channel.id, messageId)
          if (!r.success) result = r
        }
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break

      case "untrash":
        console.log(`[GMAIL-ACTION] Executing: untrash on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          const r = await untrashGmailMessage(channel.id, messageId)
          if (!r.success) result = r
        }
        labelsRemoved = ["TRASH"]
        break

      case "spam":
        console.log(`[GMAIL-ACTION] Executing: spam on ${messageIds.length} messages`)
        for (const messageId of messageIds) {
          console.log(`[GMAIL-ACTION] messages.modify ${messageId}: +SPAM -INBOX`)
          const r = await modifyGmailMessage(channel.id, messageId, ["SPAM"], ["INBOX"])
          if (!r.success) result = r
        }
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break

      default:
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-ACTION] ========== RESULT ==========`)
    console.log(`[GMAIL-ACTION] Success: ${result.success}`)
    console.log(`[GMAIL-ACTION] Labels REMOVED: [${labelsRemoved.join(",")}]`)
    console.log(`[GMAIL-ACTION] Labels ADDED: [${labelsAdded.join(",")}]`)

    if (!result.success) {
      console.error(`[GMAIL-ACTION] Action FAILED: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[GMAIL-ACTION] Action "${action}" SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      action,
      labelsRemoved,
      labelsAdded,
      messageCount: messageIds.length,
    })
  } catch (error) {
    console.error("[GMAIL-ACTION] Exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
