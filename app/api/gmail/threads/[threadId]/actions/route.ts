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

const API_VERSION = "v749-SPAM-FIX"

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
  console.log(`[GMAIL-SPAM-FIX] ========== GMAIL THREAD ACTIONS API ${API_VERSION} ==========`)

  try {
    const { threadId } = await params
    const body = await request.json()
    const { action, currentLabels } = body

    // ========== HARD ASSERT FRONTEND ==========
    if (action === "archive") {
      if (!currentLabels || !Array.isArray(currentLabels)) {
        console.error(`[GMAIL-SPAM-FIX] ❌ BUG FRONTEND: currentLabels missing or not array`)
        console.error(`[GMAIL-SPAM-FIX] Body received:`, JSON.stringify(body))
        return NextResponse.json(
          {
            error: "BUG FRONTEND: currentLabels missing - action=archive richiede currentLabels array",
            debugVersion: API_VERSION,
            receivedBody: body,
          },
          { status: 400 },
        )
      }
    }

    const labelsForLogging = currentLabels || []
    console.log(`[GMAIL-SPAM-FIX] Action: ${action}`)
    console.log(`[GMAIL-SPAM-FIX] Thread ID: ${threadId}`)
    console.log(`[GMAIL-SPAM-FIX] Current Labels RECEIVED: ${JSON.stringify(labelsForLogging)}`)

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[GMAIL-SPAM-FIX] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[GMAIL-SPAM-FIX] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[GMAIL-SPAM-FIX] Using channel: ${channel.email_address}`)

    let result: { success: boolean; error?: string }
    let labelsRemoved: string[] = []
    let labelsAdded: string[] = []

    switch (action) {
      case "markAsRead":
        console.log(`[GMAIL-SPAM-FIX] ACTION: markAsRead - removing UNREAD label`)
        result = await markGmailThreadAsRead(channel.id, threadId)
        labelsRemoved = ["UNREAD"]
        break

      case "markAsUnread":
        console.log(`[GMAIL-SPAM-FIX] ACTION: markAsUnread - adding UNREAD label`)
        result = await markGmailThreadAsUnread(channel.id, threadId)
        labelsAdded = ["UNREAD"]
        break

      case "star":
        console.log(`[GMAIL-SPAM-FIX] ACTION: star - adding STARRED label`)
        result = await starGmailThread(channel.id, threadId)
        labelsAdded = ["STARRED"]
        break

      case "unstar":
        console.log(`[GMAIL-SPAM-FIX] ACTION: unstar - removing STARRED label`)
        result = await unstarGmailThread(channel.id, threadId)
        labelsRemoved = ["STARRED"]
        break

      case "archive": {
        const threadIsInSpam = isInSpam(labelsForLogging)
        const threadIsInTrash = isInTrash(labelsForLogging)

        console.log(`[GMAIL-SPAM-FIX] ARCHIVE CHECK: isInSpam=${threadIsInSpam}, isInTrash=${threadIsInTrash}`)

        if (threadIsInSpam) {
          // ========== DEFINITIVE SPAM ARCHIVE FIX ==========
          console.log(`[GMAIL-SPAM-FIX] ========== DEFINITIVE SPAM ARCHIVE START ==========`)

          // STEP A - THREAD SAFE CLASSIFICATION
          console.log(`[GMAIL-SPAM-FIX] STEP A: threads.modify`)
          console.log(`[GMAIL-SPAM-FIX]   removeLabelIds: ["SPAM", "CATEGORY_SPAM"]`)
          console.log(`[GMAIL-SPAM-FIX]   addLabelIds: ["INBOX"]`)

          const stepAResult = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
          console.log(`[GMAIL-SPAM-FIX] STEP A RESULT: ${JSON.stringify(stepAResult)}`)

          if (!stepAResult.success) {
            console.error(`[GMAIL-SPAM-FIX] ❌ STEP A FAILED: ${stepAResult.error}`)
            return NextResponse.json(
              {
                error: `SPAM archive STEP A failed: ${stepAResult.error}`,
                debugVersion: API_VERSION,
                step: "A",
              },
              { status: 500 },
            )
          }

          // Wait 300ms as per spec
          console.log(`[GMAIL-SPAM-FIX] STEP A SUCCESS - waiting 300ms...`)
          await new Promise((resolve) => setTimeout(resolve, 300))

          // STEP B - ARCHIVE
          console.log(`[GMAIL-SPAM-FIX] STEP B: threads.modify`)
          console.log(`[GMAIL-SPAM-FIX]   removeLabelIds: ["INBOX"]`)
          console.log(`[GMAIL-SPAM-FIX]   addLabelIds: []`)

          const stepBResult = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          console.log(`[GMAIL-SPAM-FIX] STEP B RESULT: ${JSON.stringify(stepBResult)}`)

          if (!stepBResult.success) {
            console.error(`[GMAIL-SPAM-FIX] ❌ STEP B FAILED: ${stepBResult.error}`)
            return NextResponse.json(
              {
                error: `SPAM archive STEP B failed: ${stepBResult.error}`,
                debugVersion: API_VERSION,
                step: "B",
                partialSuccess: true,
                message: "Thread moved to INBOX but not archived",
              },
              { status: 500 },
            )
          }

          // STEP C - HARDEN (OBBLIGATORIO)
          console.log(`[GMAIL-SPAM-FIX] STEP C: HARDEN - fetching all messageIds in thread`)

          const { messageIds, error: fetchError } = await getGmailThreadMessages(channel.id, threadId)

          if (fetchError) {
            console.error(`[GMAIL-SPAM-FIX] ⚠️ STEP C FETCH WARNING: ${fetchError}`)
            // Continue anyway - thread modify already succeeded
          } else {
            console.log(`[GMAIL-SPAM-FIX] STEP C: Found ${messageIds.length} messages: ${JSON.stringify(messageIds)}`)

            // Call messages.modify for EACH message to remove SPAM
            for (const messageId of messageIds) {
              console.log(`[GMAIL-SPAM-FIX] STEP C: messages.modify for ${messageId}`)
              console.log(`[GMAIL-SPAM-FIX]   removeLabelIds: ["SPAM", "CATEGORY_SPAM"]`)

              const msgResult = await modifyGmailMessage(channel.id, messageId, [], ["SPAM", "CATEGORY_SPAM"])
              console.log(`[GMAIL-SPAM-FIX] STEP C message ${messageId} result: ${JSON.stringify(msgResult)}`)

              if (!msgResult.success) {
                console.error(`[GMAIL-SPAM-FIX] ⚠️ STEP C message ${messageId} FAILED: ${msgResult.error}`)
                // Continue with other messages
              }
            }
          }

          console.log(`[GMAIL-SPAM-FIX] ========== DEFINITIVE SPAM ARCHIVE COMPLETE ==========`)
          console.log(`[GMAIL-SPAM-FIX] FINAL STATE EXPECTED: Thread in ALL MAIL (no SPAM, no INBOX, no CATEGORY_SPAM)`)

          result = { success: true }
          labelsRemoved = ["SPAM", "CATEGORY_SPAM", "INBOX"]
        } else if (threadIsInTrash) {
          // Thread is in TRASH - restore it
          console.log(`[GMAIL-SPAM-FIX] ACTION: archive from TRASH - using untrash`)
          result = await untrashGmailThread(channel.id, threadId)
          labelsRemoved = ["TRASH"]
        } else {
          // Normal archive - just remove INBOX
          console.log(`[GMAIL-SPAM-FIX] ACTION: normal archive - removing INBOX label`)
          console.log(`[GMAIL-SPAM-FIX] threads.modify({ addLabelIds: [], removeLabelIds: ["INBOX"] })`)
          result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          labelsRemoved = ["INBOX"]
        }
        break
      }

      case "trash":
        console.log(`[GMAIL-SPAM-FIX] ACTION: trash - moving to trash`)
        result = await trashGmailThread(channel.id, threadId)
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break

      case "untrash":
        console.log(`[GMAIL-SPAM-FIX] ACTION: untrash - restoring from trash`)
        result = await untrashGmailThread(channel.id, threadId)
        labelsRemoved = ["TRASH"]
        break

      case "spam":
        console.log(`[GMAIL-SPAM-FIX] ACTION: spam - adding SPAM, removing INBOX`)
        result = await spamGmailThread(channel.id, threadId)
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break

      case "unspam":
        console.log(`[GMAIL-SPAM-FIX] ACTION: unspam - removing SPAM, adding INBOX`)
        console.log(
          `[GMAIL-SPAM-FIX] threads.modify({ addLabelIds: ["INBOX"], removeLabelIds: ["SPAM", "CATEGORY_SPAM"] })`,
        )
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM", "CATEGORY_SPAM"])
        labelsRemoved = ["SPAM", "CATEGORY_SPAM"]
        labelsAdded = ["INBOX"]
        break

      default:
        console.error(`[GMAIL-SPAM-FIX] Unknown action: ${action}`)
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    // Calculate expected final state
    const labelsAfter = labelsForLogging
      .filter((l: string) => !labelsRemoved.includes(l))
      .concat(labelsAdded.filter((l: string) => !labelsForLogging.includes(l)))

    console.log(`[GMAIL-SPAM-FIX] ========== ACTION COMPLETE ==========`)
    console.log(`[GMAIL-SPAM-FIX] Labels REMOVED: ${JSON.stringify(labelsRemoved)}`)
    console.log(`[GMAIL-SPAM-FIX] Labels ADDED: ${JSON.stringify(labelsAdded)}`)
    console.log(`[GMAIL-SPAM-FIX] Labels EXPECTED AFTER: ${JSON.stringify(labelsAfter)}`)

    if (!result.success) {
      console.error(`[GMAIL-SPAM-FIX] ❌ Gmail action FAILED: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[GMAIL-SPAM-FIX] ✅ Gmail thread action "${action}" SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      action,
      labelsRemoved,
      labelsAdded,
      labelsExpectedAfter: labelsAfter,
    })
  } catch (error) {
    console.error("[GMAIL-SPAM-FIX] Gmail thread action exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
