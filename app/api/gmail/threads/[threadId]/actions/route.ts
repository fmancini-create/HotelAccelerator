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
} from "@/lib/gmail-client"

const API_VERSION = "v748"

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
  console.log(`[v0] ========== GMAIL THREAD ACTIONS API ${API_VERSION} ==========`)

  try {
    const { threadId } = await params
    const body = await request.json()
    const { action, currentLabels = [] } = body

    if (action === "archive") {
      if (!currentLabels || !Array.isArray(currentLabels)) {
        console.error(`[v0] ❌ HARD ASSERT FAILED: archive action called WITHOUT currentLabels`)
        console.error(`[v0] Body received: ${JSON.stringify(body)}`)
        return NextResponse.json(
          {
            error: "CRITICAL: archive action requires currentLabels array. This is a frontend bug.",
            debugVersion: API_VERSION,
            receivedBody: body,
          },
          { status: 400 },
        )
      }
    }

    const labelsForLogging = currentLabels || []
    console.log(`[v0] Action: ${action}`)
    console.log(`[v0] Thread ID: ${threadId}`)
    console.log(`[v0] Current Labels RECEIVED: ${JSON.stringify(labelsForLogging)}`)

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[v0] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[v0] Using channel: ${channel.email_address}`)

    let result: { success: boolean; error?: string }
    let labelsRemoved: string[] = []
    let labelsAdded: string[] = []

    switch (action) {
      case "markAsRead":
        console.log(`[v0] ACTION: markAsRead - removing UNREAD label`)
        result = await markGmailThreadAsRead(channel.id, threadId)
        labelsRemoved = ["UNREAD"]
        break

      case "markAsUnread":
        console.log(`[v0] ACTION: markAsUnread - adding UNREAD label`)
        result = await markGmailThreadAsUnread(channel.id, threadId)
        labelsAdded = ["UNREAD"]
        break

      case "star":
        console.log(`[v0] ACTION: star - adding STARRED label`)
        result = await starGmailThread(channel.id, threadId)
        labelsAdded = ["STARRED"]
        break

      case "unstar":
        console.log(`[v0] ACTION: unstar - removing STARRED label`)
        result = await unstarGmailThread(channel.id, threadId)
        labelsRemoved = ["STARRED"]
        break

      case "archive": {
        const isInSpam = currentLabels.includes("SPAM")
        const isInTrash = currentLabels.includes("TRASH")

        console.log(`[v0] ARCHIVE: isInSpam=${isInSpam}, isInTrash=${isInTrash}`)

        if (isInSpam) {
          // ========== TWO-STEP SPAM ARCHIVE (EXACT SPEC) ==========
          console.log(`[v0] ========== TWO-STEP SPAM ARCHIVE START ==========`)

          // STEP 1: Remove SPAM, Add INBOX (force safe classification)
          console.log(`[v0] STEP 1: threads.modify({ addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] })`)
          const step1Result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM"])
          console.log(`[v0] STEP 1 RESULT: ${JSON.stringify(step1Result)}`)

          if (!step1Result.success) {
            console.error(`[v0] ❌ STEP 1 FAILED: ${step1Result.error}`)
            return NextResponse.json(
              {
                error: `SPAM archive STEP 1 failed: ${step1Result.error}`,
                debugVersion: API_VERSION,
                step: 1,
              },
              { status: 500 },
            )
          }

          console.log(`[v0] STEP 1 SUCCESS - waiting 300ms before STEP 2...`)
          await new Promise((resolve) => setTimeout(resolve, 300))

          // STEP 2: Remove INBOX (archive)
          console.log(`[v0] STEP 2: threads.modify({ addLabelIds: [], removeLabelIds: ["INBOX"] })`)
          const step2Result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          console.log(`[v0] STEP 2 RESULT: ${JSON.stringify(step2Result)}`)

          if (!step2Result.success) {
            console.error(`[v0] ❌ STEP 2 FAILED: ${step2Result.error}`)
            return NextResponse.json(
              {
                error: `SPAM archive STEP 2 failed: ${step2Result.error}`,
                debugVersion: API_VERSION,
                step: 2,
                partialSuccess: true,
                message: "Thread moved to INBOX but not archived",
              },
              { status: 500 },
            )
          }

          console.log(`[v0] ========== TWO-STEP SPAM ARCHIVE COMPLETE ==========`)
          console.log(`[v0] FINAL STATE: Thread should be in ALL MAIL (no SPAM, no INBOX)`)
          result = { success: true }
          labelsRemoved = ["SPAM", "INBOX"]
        } else if (isInTrash) {
          // Thread is in TRASH - restore it
          console.log(`[v0] ACTION: archive from TRASH - using untrash`)
          result = await untrashGmailThread(channel.id, threadId)
          labelsRemoved = ["TRASH"]
        } else {
          // Normal archive - just remove INBOX
          console.log(`[v0] ACTION: normal archive - removing INBOX label`)
          console.log(`[v0] threads.modify({ addLabelIds: [], removeLabelIds: ["INBOX"] })`)
          result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          labelsRemoved = ["INBOX"]
        }
        break
      }

      case "trash":
        console.log(`[v0] ACTION: trash - moving to trash`)
        result = await trashGmailThread(channel.id, threadId)
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break

      case "untrash":
        console.log(`[v0] ACTION: untrash - restoring from trash`)
        result = await untrashGmailThread(channel.id, threadId)
        labelsRemoved = ["TRASH"]
        break

      case "spam":
        console.log(`[v0] ACTION: spam - adding SPAM, removing INBOX`)
        result = await spamGmailThread(channel.id, threadId)
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break

      case "unspam":
        console.log(`[v0] ACTION: unspam - removing SPAM, adding INBOX`)
        console.log(`[v0] threads.modify({ addLabelIds: ["INBOX"], removeLabelIds: ["SPAM"] })`)
        result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM"])
        labelsRemoved = ["SPAM"]
        labelsAdded = ["INBOX"]
        break

      default:
        console.error(`[v0] Unknown action: ${action}`)
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    // Calculate expected final state
    const labelsAfter = labelsForLogging
      .filter((l: string) => !labelsRemoved.includes(l))
      .concat(labelsAdded.filter((l: string) => !labelsForLogging.includes(l)))

    console.log(`[v0] ========== ACTION COMPLETE ==========`)
    console.log(`[v0] Labels REMOVED: ${JSON.stringify(labelsRemoved)}`)
    console.log(`[v0] Labels ADDED: ${JSON.stringify(labelsAdded)}`)
    console.log(`[v0] Labels EXPECTED AFTER: ${JSON.stringify(labelsAfter)}`)

    if (!result.success) {
      console.error(`[v0] ❌ Gmail action FAILED: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[v0] ✅ Gmail thread action "${action}" SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      action,
      labelsRemoved,
      labelsAdded,
      labelsExpectedAfter: labelsAfter,
    })
  } catch (error) {
    console.error("[v0] Gmail thread action exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
