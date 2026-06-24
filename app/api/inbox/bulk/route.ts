import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"
import { pushConversationStateToGmail } from "@/lib/email/gmail-state-sync"

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Bulk status/read change for inbox conversations.
 *
 * Why this exists: the previous bulk UI fired N concurrent PATCH /api/inbox/[id]
 * requests via Promise.all. Each one independently pushed a label change to
 * Gmail, so archiving "several" messages produced N simultaneous Gmail
 * threads.modify calls for the SAME user -> Gmail 429 "Too many concurrent
 * requests for user". The push is best-effort, so failures were swallowed and
 * the DB ended up 'resolved' while Gmail kept the INBOX label (the reported
 * "archived in app but not on Gmail" bug).
 *
 * This endpoint updates the DB once for all ids, then pushes to Gmail
 * SEQUENTIALLY (one thread at a time) so there is no self-inflicted concurrency.
 * It returns how many Gmail syncs failed so the UI can warn the user.
 */
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    const body = await request.json()
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : []
    const status: string | undefined = typeof body?.status === "string" ? body.status : undefined
    const markRead: boolean = body?.markRead === true
    const markUnread: boolean = body?.markUnread === true

    const validIds = ids.filter((id) => UUID_REGEX.test(id))
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid conversation ids", code: "VALIDATION_ERROR" }, { status: 400 })
    }
    if (!status && !markRead && !markUnread) {
      return NextResponse.json({ error: "Nothing to update", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    // 1) One DB update for the whole batch (scoped to the tenant).
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status) update.status = status
    if (markRead) update.unread_count = 0
    // markUnread: ripristina lo stato "non letto" (almeno 1 messaggio non letto).
    if (markUnread) update.unread_count = 1

    const { data: updatedRows, error } = await supabase
      .from("conversations")
      .update(update)
      .in("id", validIds)
      .eq("property_id", propertyId)
      .select("id")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const updatedIds = (updatedRows ?? []).map((r: { id: string }) => r.id)

    // 2) Mirror to Gmail SEQUENTIALLY (no concurrent burst -> no self-429).
    const change: { read?: boolean; status?: string } = {}
    if (status) change.status = status
    if (markRead) change.read = true
    if (markUnread) change.read = false

    let gmailFailed = 0
    for (const id of updatedIds) {
      try {
        const res = await pushConversationStateToGmail(supabase, id, propertyId, change)
        // Only count email conversations whose Gmail label change failed.
        if (res.applicable && !res.ok) gmailFailed++
      } catch {
        // Defensive: one bad thread must never abort the rest of the batch.
        gmailFailed++
      }
    }

    return NextResponse.json({ updated: updatedIds.length, gmailFailed })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
