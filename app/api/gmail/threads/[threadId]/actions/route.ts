import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  markGmailThreadAsRead,
  markGmailThreadAsUnread,
  starGmailThread,
  unstarGmailThread,
  trashGmailThread,
  spamGmailThread,
  unspamGmailThread,
  untrashGmailThread,
  modifyGmailThread,
} from "@/lib/gmail-client"

const API_VERSION = "v747"

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

    console.log(`[v0] Action: ${action}`)
    console.log(`[v0] Thread ID: ${threadId}`)
    console.log(`[v0] Current Labels BEFORE: ${JSON.stringify(currentLabels)}`)

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
        result = await markGmailThreadAsRead(channel.id, threadId)
        labelsRemoved = ["UNREAD"]
        break
      case "markAsUnread":
        result = await markGmailThreadAsUnread(channel.id, threadId)
        labelsAdded = ["UNREAD"]
        break
      case "star":
        result = await starGmailThread(channel.id, threadId)
        labelsAdded = ["STARRED"]
        break
      case "unstar":
        result = await unstarGmailThread(channel.id, threadId)
        labelsRemoved = ["STARRED"]
        break
      case "archive": {
        const isInSpam = currentLabels.includes("SPAM")
        const isInTrash = currentLabels.includes("TRASH")

        if (isInSpam) {
          // CRITICAL TWO-STEP FIX for SPAM
          // Gmail re-classifies as spam if you only remove SPAM label
          // MUST: 1) Remove SPAM + Add INBOX, 2) Remove INBOX
          console.log("[v0] ========== TWO-STEP SPAM ARCHIVE ==========")

          // STEP 1: Force safe classification - Remove SPAM, Add INBOX
          console.log("[v0] STEP 1: Removing SPAM, Adding INBOX (force safe classification)")
          const step1Result = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM"])
          console.log(`[v0] STEP 1 Result: ${JSON.stringify(step1Result)}`)

          if (!step1Result.success) {
            console.log(`[v0] ❌ STEP 1 FAILED: ${step1Result.error}`)
            return NextResponse.json(
              {
                error: `SPAM fix step 1 failed: ${step1Result.error}`,
                debugVersion: API_VERSION,
              },
              { status: 500 },
            )
          }

          // Small delay to ensure Gmail processes step 1
          await new Promise((resolve) => setTimeout(resolve, 200))

          // STEP 2: Archive - Remove INBOX
          console.log("[v0] STEP 2: Removing INBOX (archive)")
          const step2Result = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
          console.log(`[v0] STEP 2 Result: ${JSON.stringify(step2Result)}`)

          if (!step2Result.success) {
            console.log(`[v0] ❌ STEP 2 FAILED: ${step2Result.error}`)
            // Step 1 succeeded but step 2 failed - thread is in INBOX now, not spam
            return NextResponse.json(
              {
                error: `SPAM fix step 2 failed: ${step2Result.error}`,
                debugVersion: API_VERSION,
                partialSuccess: true,
                message: "Thread moved to INBOX but not archived",
              },
              { status: 500 },
            )
          }

          console.log("[v0] ✅ TWO-STEP SPAM ARCHIVE COMPLETE")
          result = { success: true }
          labelsRemoved = ["SPAM", "INBOX"]
        } else if (isInTrash) {
          // Thread is in TRASH - use untrash
          console.log("[v0] SMART ARCHIVE: Thread is in TRASH, using untrash")
          result = await untrashGmailThread(channel.id, threadId)
          labelsRemoved = ["TRASH"]
        } else {
          // Normal archive - remove from INBOX
          console.log("[v0] SMART ARCHIVE: Normal archive, removing INBOX label")
          labelsRemoved = ["INBOX"]
          result = await modifyGmailThread(channel.id, threadId, [], labelsRemoved)
        }
        break
      }
      case "trash":
        result = await trashGmailThread(channel.id, threadId)
        labelsAdded = ["TRASH"]
        labelsRemoved = ["INBOX", "SPAM"]
        break
      case "untrash":
        result = await untrashGmailThread(channel.id, threadId)
        labelsRemoved = ["TRASH"]
        break
      case "spam":
        result = await spamGmailThread(channel.id, threadId)
        labelsAdded = ["SPAM"]
        labelsRemoved = ["INBOX"]
        break
      case "unspam":
        result = await unspamGmailThread(channel.id, threadId)
        labelsRemoved = ["SPAM"]
        labelsAdded = ["INBOX"]
        break
      case "archiveFromSpam":
        console.log("[v0] ========== TWO-STEP archiveFromSpam ==========")

        // STEP 1: Remove SPAM, Add INBOX
        console.log("[v0] STEP 1: Removing SPAM, Adding INBOX")
        const afStep1 = await modifyGmailThread(channel.id, threadId, ["INBOX"], ["SPAM"])
        console.log(`[v0] STEP 1 Result: ${JSON.stringify(afStep1)}`)

        if (!afStep1.success) {
          return NextResponse.json(
            {
              error: `archiveFromSpam step 1 failed: ${afStep1.error}`,
              debugVersion: API_VERSION,
            },
            { status: 500 },
          )
        }

        await new Promise((resolve) => setTimeout(resolve, 200))

        // STEP 2: Remove INBOX
        console.log("[v0] STEP 2: Removing INBOX")
        const afStep2 = await modifyGmailThread(channel.id, threadId, [], ["INBOX"])
        console.log(`[v0] STEP 2 Result: ${JSON.stringify(afStep2)}`)

        if (!afStep2.success) {
          return NextResponse.json(
            {
              error: `archiveFromSpam step 2 failed: ${afStep2.error}`,
              debugVersion: API_VERSION,
            },
            { status: 500 },
          )
        }

        result = { success: true }
        labelsRemoved = ["SPAM", "INBOX"]
        break
      default:
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    const labelsAfter = currentLabels
      .filter((l: string) => !labelsRemoved.includes(l))
      .concat(labelsAdded.filter((l: string) => !currentLabels.includes(l)))

    console.log(`[v0] Labels REMOVED: ${JSON.stringify(labelsRemoved)}`)
    console.log(`[v0] Labels ADDED: ${JSON.stringify(labelsAdded)}`)
    console.log(`[v0] Labels expected AFTER: ${JSON.stringify(labelsAfter)}`)

    if (!result.success) {
      console.log(`[v0] ❌ Gmail action FAILED: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[v0] ✅ Gmail thread action ${action} SUCCESSFUL`)

    return NextResponse.json({
      success: true,
      debugVersion: API_VERSION,
      labelsRemoved,
      labelsAdded,
      labelsExpectedAfter: labelsAfter,
    })
  } catch (error) {
    console.error("[v0] Gmail thread action error:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
