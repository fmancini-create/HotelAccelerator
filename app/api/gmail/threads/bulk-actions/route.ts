import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  markGmailThreadAsRead,
  trashGmailThread,
  modifyGmailThread,
} from "@/lib/gmail-client"
import { resolveGmailChannelId } from "@/lib/gmail-channel-resolver"

const API_VERSION = "bulk-v1"

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type BulkAction = "archive" | "trash" | "markAsRead"

async function applyAction(
  channelId: string,
  threadId: string,
  action: BulkAction,
): Promise<{ success: boolean; error?: string }> {
  switch (action) {
    case "archive":
      // Archive from inbox = remove INBOX label
      return modifyGmailThread(channelId, threadId, [], ["INBOX"])
    case "trash":
      return trashGmailThread(channelId, threadId)
    case "markAsRead":
      return markGmailThreadAsRead(channelId, threadId)
    default:
      return { success: false, error: "Azione non valida" }
  }
}

/**
 * Bulk action on multiple Gmail threads.
 * Resolves the channel ONCE and processes threads SEQUENTIALLY (with a small
 * delay and one retry on 429-style failures) to avoid hammering the Gmail API
 * with N parallel requests, which previously caused rate-limit failures so that
 * "select all + archive" silently did nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, threadIds, channelId: requestedChannelId } = body as {
      action: BulkAction
      threadIds: string[]
      channelId?: string | null
    }

    const validActions: BulkAction[] = ["archive", "trash", "markAsRead"]
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }
    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return NextResponse.json({ error: "Nessun thread selezionato", debugVersion: API_VERSION }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    // Resolve the channel ONCE for the whole batch (multitenant-safe)
    const { channelId } = await resolveGmailChannelId(supabase, user.id, requestedChannelId)
    if (!channelId) {
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    const succeeded: string[] = []
    const failed: { threadId: string; error: string }[] = []

    // Process sequentially to stay within Gmail rate limits
    for (const threadId of threadIds) {
      let result = await applyAction(channelId, threadId, action)

      // One retry after a backoff if the first attempt failed (often rate limit)
      if (!result.success) {
        await delay(600)
        result = await applyAction(channelId, threadId, action)
      }

      if (result.success) {
        succeeded.push(threadId)
      } else {
        failed.push({ threadId, error: result.error || "Errore sconosciuto" })
      }

      // Gentle pacing between threads
      await delay(150)
    }

    console.log(
      `[GMAIL-BULK] action=${action} total=${threadIds.length} ok=${succeeded.length} failed=${failed.length}`,
    )

    return NextResponse.json({
      success: failed.length === 0,
      debugVersion: API_VERSION,
      action,
      total: threadIds.length,
      succeeded,
      failed,
    })
  } catch (error) {
    console.error("[GMAIL-BULK] Exception:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
