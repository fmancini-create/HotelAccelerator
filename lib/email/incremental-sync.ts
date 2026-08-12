// Reliable incremental email sync — provider-polling based.
//
// This does NOT depend on Gmail push (Pub/Sub) delivery, nor on any internal
// self-fetch via NEXT_PUBLIC_APP_URL. It talks to the Gmail API directly using
// a service-role Supabase client, so it works from a cron with no user session.
//
// It is the safety net that guarantees mail keeps flowing even when the
// real-time push pipeline is down. EmailProcessor deduplicates by external id,
// so running this alongside the webhook is safe (idempotent).

import { EmailProcessor, type InboundEmail } from "@/lib/email/email-processor"
import { parseGmailMessage } from "@/lib/email/gmail-parse"
import { getValidGmailToken } from "@/lib/gmail-client"

// Keep a one-hour overlap with the last completed poll. The processor is
// idempotent, so overlap is cheap and protects against clock skew / transient
// failures without repeatedly scanning the whole mailbox.
const MAX_MESSAGES_PER_RUN = 500
const GMAIL_LIST_PAGE_SIZE = 100
const POLL_OVERLAP_SECONDS = 60 * 60
const INITIAL_POLL_LOOKBACK_MS = 24 * 60 * 60 * 1000
const PER_MESSAGE_DELAY_MS = 60
const GOOGLE_REQUEST_TIMEOUT_MS = 12_000
const FULL_STATE_RECONCILE_INTERVAL_MS = 60 * 60 * 1000
const DATABASE_UPDATE_CHUNK = 150

export interface SyncableChannel {
  id: string
  property_id: string
  provider: string
  email_address: string | null
  oauth_access_token: string | null
  oauth_refresh_token: string | null
  oauth_expiry: string | null
  created_at?: string | null
  last_sync_at?: string | null
  gmail_state_reconciled_at?: string | null
}

export interface ChannelSyncResult {
  channelId: string
  email: string | null
  imported: number
  duplicates: number
  errors: number
  scanned: number
  // Bidirectional star reconciliation (Gmail -> app)
  starsAdded?: number
  starsRemoved?: number
  // Bidirectional state reconciliation (Gmail -> app)
  spamSynced?: number
  trashSynced?: number
  restored?: number
  readSynced?: number
  stateReconciled?: boolean
  error?: string
  // True when the Gmail grant is revoked and the mailbox needs reconnection.
  reconnectRequired?: boolean
}

/**
 * Records (or clears) the reconnect/health state of a channel so the inbox can
 * surface a "Riconnetti Gmail" banner. Best-effort: never throws.
 */
async function recordChannelHealth(
  supabase: any,
  channelId: string,
  opts: { reconnectRequired: boolean; error?: string | null },
): Promise<void> {
  try {
    await supabase
      .from("email_channels")
      .update({
        oauth_reconnect_required: opts.reconnectRequired,
        last_sync_error: opts.reconnectRequired ? opts.error ?? "Autorizzazione Gmail revocata" : null,
        last_sync_error_at: opts.reconnectRequired ? new Date().toISOString() : null,
      })
      .eq("id", channelId)
  } catch (e) {
    console.error("[v0][incremental-sync] health update failed:", e)
  }
}

export async function listRecentInboxMessageIds(
  token: string,
  query: string,
  hardCap = MAX_MESSAGES_PER_RUN,
): Promise<{ ids: Array<{ id: string }>; complete: boolean; error?: string }> {
  const ids: Array<{ id: string }> = []
  const seen = new Set<string>()
  let pageToken: string | null = null
  let listedCount = 0

  try {
    do {
      const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
      listUrl.searchParams.set("maxResults", String(Math.min(GMAIL_LIST_PAGE_SIZE, hardCap - listedCount)))
      listUrl.searchParams.set("q", query)
      if (pageToken) listUrl.searchParams.set("pageToken", pageToken)

      const listRes = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      })
      if (!listRes.ok) {
        return { ids: [], complete: false, error: `Gmail list HTTP ${listRes.status}` }
      }

      const listData = await listRes.json()
      const page: Array<{ id?: string }> = listData.messages || []
      listedCount += page.length
      for (const message of page) {
        if (message.id && !seen.has(message.id)) {
          seen.add(message.id)
          ids.push({ id: message.id })
        }
      }

      pageToken = listData.nextPageToken || null
      if (pageToken && listedCount >= hardCap) {
        return {
          ids: [],
          complete: false,
          error: `Backlog Gmail superiore al limite sicuro di ${hardCap} messaggi; avviare la sincronizzazione storica`,
        }
      }
    } while (pageToken)

    return { ids, complete: true }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
    return {
      ids: [],
      complete: false,
      error: timedOut ? "Timeout temporaneo durante la lettura del backlog Gmail" : "Errore di rete Gmail",
    }
  }
}

/**
 * Pulls the most recent INBOX messages for a single Gmail channel and runs them
 * through the centralized EmailProcessor (idempotent). Safe to call repeatedly.
 */
export async function syncChannelIncremental(
  supabase: any,
  channel: SyncableChannel,
): Promise<ChannelSyncResult> {
  const out: ChannelSyncResult = {
    channelId: channel.id,
    email: channel.email_address,
    imported: 0,
    duplicates: 0,
    errors: 0,
    scanned: 0,
  }

  if (channel.provider !== "gmail") {
    out.error = "Provider non supportato dal polling (solo Gmail)"
    return out
  }

  const tokenResult = await getValidGmailToken(channel.id, supabase)
  if (!tokenResult.token) {
    out.error = tokenResult.error || "Token non disponibile"
    // A revoked grant (invalid_grant) permanently blocks this mailbox until the
    // operator reconnects it — persist that so the inbox can flag it. Transient
    // errors (timeout, 429, 503) never set the reconnect flag.
    if (tokenResult.reconnectRequired) {
      out.reconnectRequired = true
      await recordChannelHealth(supabase, channel.id, {
        reconnectRequired: true,
        error: tokenResult.error,
      })
    }
    return out
  }
  const token = tokenResult.token

  // List the complete bounded backlog before advancing the watermark. A
  // truncated Gmail page is never treated as a completed poll.
  const lastCompletedSync = channel.last_sync_at ? new Date(channel.last_sync_at).getTime() : Number.NaN
  const channelCreatedAt = channel.created_at ? new Date(channel.created_at).getTime() : Number.NaN
  const initialAnchor = Math.max(
    Number.isFinite(channelCreatedAt) ? channelCreatedAt : 0,
    Date.now() - INITIAL_POLL_LOOKBACK_MS,
  )
  const syncAnchor = Number.isFinite(lastCompletedSync) ? lastCompletedSync : initialAnchor
  const afterEpoch = Math.max(0, Math.floor(syncAnchor / 1000) - POLL_OVERLAP_SECONDS)
  const query = `in:inbox after:${afterEpoch}`
  const listed = await listRecentInboxMessageIds(token, query)

  if (!listed.complete) {
    out.error = listed.error || `Backlog Gmail superiore al limite sicuro di ${MAX_MESSAGES_PER_RUN}`
    return out
  }

  const ids = listed.ids
  if (ids.length === 0) {
    await recordChannelHealth(supabase, channel.id, { reconnectRequired: false })
    await markPollCompleted(supabase, channel.id)
    return out
  }

  const processor = new EmailProcessor(supabase)

  // Authoritative read-state of the threads scanned this run (threadId -> isUnread).
  // A thread counts as unread if any of its scanned messages still has UNREAD.
  const scannedThreadRead = new Map<string, boolean>()

  for (const { id } of ids) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
        },
      )
      if (msgRes.status === 429) {
        out.error = "Limite temporaneo Gmail raggiunto"
        break // next run retains the previous successful watermark
      }
      if (!msgRes.ok) {
        out.errors++
        out.scanned++
        continue
      }
      const msgData = await msgRes.json()
      if (msgData?.threadId) {
        const isUnread = Array.isArray(msgData.labelIds) && msgData.labelIds.includes("UNREAD")
        scannedThreadRead.set(msgData.threadId, (scannedThreadRead.get(msgData.threadId) || false) || isUnread)
      }
      const parsed: InboundEmail = parseGmailMessage(msgData)
      const result = await processor.processInboundEmail(parsed, channel.id, channel.property_id)
      if (result?.success) {
        if (result.isDuplicate) out.duplicates++
        else out.imported++
      } else {
        out.errors++
      }
      out.scanned++
      if (PER_MESSAGE_DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, PER_MESSAGE_DELAY_MS))
      }
    } catch (e) {
      console.error("[v0][incremental-sync] message error:", e)
      out.errors++
      out.scanned++
    }
  }

  // Bidirectional star sync: reconcile the app's is_starred flag with Gmail's
  // STARRED label (Gmail is the source of truth for email stars). This catches
  // stars added/removed directly inside Gmail. Best-effort: never fail the sync.
  try {
    const stars = await reconcileChannelStars(supabase, channel, token)
    out.starsAdded = stars.added
    out.starsRemoved = stars.removed
  } catch (e) {
    console.error("[v0][incremental-sync] star reconcile error:", e)
  }

  // A mailbox-wide pass repairs historical drift (including the legacy import
  // that marked every message unread). Between full passes, only reconcile the
  // recent threads whose labels were observed during this poll.
  try {
    const lastFullStateSync = channel.gmail_state_reconciled_at
      ? new Date(channel.gmail_state_reconciled_at).getTime()
      : Number.NaN
    const fullStateDue =
      !Number.isFinite(lastFullStateSync) || Date.now() - lastFullStateSync >= FULL_STATE_RECONCILE_INTERVAL_MS
    const states = fullStateDue
      ? await reconcileMailboxState(supabase, channel, token)
      : await reconcileChannelStates(supabase, channel, token, scannedThreadRead)
    out.spamSynced = states.spam
    out.trashSynced = states.trash
    out.restored = states.restored
    out.readSynced = states.read
    out.stateReconciled = fullStateDue
  } catch (e) {
    console.error("[v0][incremental-sync] state reconcile error:", e)
  }

  // The token was valid this run, so any previously-recorded revoked state is
  // resolved. Clear the reconnect flag (best-effort) so the banner disappears.
  await recordChannelHealth(supabase, channel.id, { reconnectRequired: false })

  // Never move the polling watermark past a partially failed batch. The next
  // run will repeat the overlap and recover the missing message.
  if (!out.error && out.errors === 0) {
    await markPollCompleted(supabase, channel.id)
  }

  return out
}

/**
 * Reconciles the `is_starred` flag of this channel's email conversations with
 * Gmail's STARRED label. Direction: Gmail -> app (the app -> Gmail direction is
 * handled synchronously by the toggle-star route). Gmail is the source of truth
 * for email stars, so this also clears stars that were removed inside Gmail.
 *
 * Only touches email conversations belonging to this channel — WhatsApp and
 * other channels are never affected.
 */
export async function reconcileChannelStars(
  supabase: any,
  channel: SyncableChannel,
  token: string,
): Promise<{ added: number; removed: number }> {
  const result = { added: 0, removed: 0 }

  // 1) Collect the set of currently-starred Gmail thread IDs (small set).
  const starredThreadIds = await listAllThreadIds(token, "is:starred")

  // 2) Star conversations whose thread is starred in Gmail but not in the app.
  if (starredThreadIds.size > 0) {
    const { data: toStar } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .eq("is_starred", false)
      .in("gmail_thread_id", Array.from(starredThreadIds))

    const idsToStar = (toStar || []).map((c: any) => c.id)
    if (idsToStar.length > 0) {
      await supabase
        .from("conversations")
        .update({ is_starred: true, updated_at: new Date().toISOString() })
        .in("id", idsToStar)
      result.added = idsToStar.length
    }
  }

  // 3) Un-star conversations that are starred in the app but no longer in Gmail.
  const { data: currentlyStarred } = await supabase
    .from("conversations")
    .select("id, gmail_thread_id")
    .eq("property_id", channel.property_id)
    .eq("channel_id", channel.id)
    .eq("is_starred", true)

  const idsToUnstar = (currentlyStarred || [])
    .filter((c: any) => !c.gmail_thread_id || !starredThreadIds.has(c.gmail_thread_id))
    .map((c: any) => c.id)

  if (idsToUnstar.length > 0) {
    await supabase
      .from("conversations")
      .update({ is_starred: false, updated_at: new Date().toISOString() })
      .in("id", idsToUnstar)
    result.removed = idsToUnstar.length
  }

  return result
}

/** Lists Gmail thread IDs matching a query, capped. Returns a Set. */
async function listThreadIds(token: string, q: string, cap = 200): Promise<Set<string>> {
  const ids = new Set<string>()
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads")
  url.searchParams.set("q", q)
  url.searchParams.set("maxResults", String(cap))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Gmail threads(${q}) HTTP ${res.status}`)
  const data = await res.json()
  for (const t of data.threads || []) if (t?.id) ids.add(t.id)
  return ids
}

/** Lists every matching Gmail thread before making any negative reconciliation. */
async function listAllThreadIds(token: string, q: string, hardCap = 20_000): Promise<Set<string>> {
  const ids = new Set<string>()
  let pageToken: string | null = null

  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads")
    url.searchParams.set("q", q)
    url.searchParams.set("maxResults", "500")
    if (pageToken) url.searchParams.set("pageToken", pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Gmail threads(${q}) HTTP ${res.status}`)

    const data = await res.json()
    for (const thread of data.threads || []) {
      if (thread?.id) ids.add(thread.id)
    }
    pageToken = data.nextPageToken || null
    if (pageToken && ids.size >= hardCap) {
      // Absence is only authoritative after complete pagination. Abort instead
      // of clearing valid state from threads beyond an arbitrary cap.
      throw new Error(`Gmail threads(${q}) supera il limite sicuro di ${hardCap}`)
    }
  } while (pageToken)

  return ids
}

/**
 * Repairs the complete Gmail-derived conversation state.
 *
 * The heavy negative reconciliation is deliberately limited to UNREAD, SPAM
 * and TRASH. Listing every INBOX thread on a mature mailbox can require hundreds
 * of Gmail calls and repeatedly time out the five-minute cron. A complete unread
 * listing is enough to repair the false KPI values that triggered this incident;
 * current folder changes continue to be handled by message labels and the light
 * five-minute pass.
 */
export async function reconcileMailboxState(
  supabase: any,
  channel: SyncableChannel,
  token: string,
): Promise<{ spam: number; trash: number; restored: number; read: number }> {
  const cutoff = new Date().toISOString()
  const [unreadSet, spamSet, trashSet] = await Promise.all([
    listAllThreadIds(token, "is:unread in:inbox"),
    listAllThreadIds(token, "in:spam"),
    listAllThreadIds(token, "in:trash"),
  ])

  const result = { spam: 0, trash: 0, restored: 0, read: 0 }
  result.spam = await applyGmailStatus(supabase, channel, spamSet, "spam", cutoff)
  result.trash = await applyGmailStatus(supabase, channel, trashSet, "deleted", cutoff)

  const { data: parked, error: parkedError } = await supabase
    .from("conversations")
    .select("id, gmail_thread_id")
    .eq("property_id", channel.property_id)
    .eq("channel_id", channel.id)
    .in("status", ["spam", "deleted"])
    .lte("updated_at", cutoff)
  if (parkedError) throw new Error(`Gmail parked-state read failed: ${parkedError.message}`)

  const restoredIds = (parked || [])
    .filter(
      (conversation: any) =>
        conversation.gmail_thread_id &&
        !spamSet.has(conversation.gmail_thread_id) &&
        !trashSet.has(conversation.gmail_thread_id),
    )
    .map((conversation: any) => conversation.id)
  for (let index = 0; index < restoredIds.length; index += DATABASE_UPDATE_CHUNK) {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "open" })
      .in("id", restoredIds.slice(index, index + DATABASE_UPDATE_CHUNK))
      .lte("updated_at", cutoff)
    if (error) throw new Error(`Gmail restore reconciliation failed: ${error.message}`)
  }
  result.restored = restoredIds.length

  // Clear stale unread flags in one server-side update, protected by the
  // reconciliation cutoff so a message arriving concurrently is not erased.
  const { count: staleUnreadCount, error: countError } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("property_id", channel.property_id)
    .eq("channel_id", channel.id)
    .gt("unread_count", 0)
    .lte("updated_at", cutoff)
  if (countError) throw new Error(`Gmail unread reconciliation count failed: ${countError.message}`)

  const { error: clearError } = await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("property_id", channel.property_id)
    .eq("channel_id", channel.id)
    .gt("unread_count", 0)
    .lte("updated_at", cutoff)
  if (clearError) throw new Error(`Gmail unread reconciliation clear failed: ${clearError.message}`)
  result.read = staleUnreadCount || 0

  const unreadThreadIds = Array.from(unreadSet)
  for (let index = 0; index < unreadThreadIds.length; index += DATABASE_UPDATE_CHUNK) {
    const threadChunk = unreadThreadIds.slice(index, index + DATABASE_UPDATE_CHUNK)
    const { data: toUnread, error: unreadReadError } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .in("gmail_thread_id", threadChunk)
      .lte("updated_at", cutoff)
    if (unreadReadError) throw new Error(`Gmail unread thread lookup failed: ${unreadReadError.message}`)

    const ids = (toUnread || []).map((conversation: any) => conversation.id)
    if (ids.length === 0) continue
    const { error: unreadUpdateError } = await supabase
      .from("conversations")
      .update({ unread_count: 1 })
      .in("id", ids)
      .lte("updated_at", cutoff)
    if (unreadUpdateError) throw new Error(`Gmail unread thread update failed: ${unreadUpdateError.message}`)
  }

  const { error: watermarkError } = await supabase
    .from("email_channels")
    .update({ gmail_state_reconciled_at: new Date().toISOString() })
    .eq("id", channel.id)
  if (watermarkError) throw new Error(`Reconciliation watermark failed: ${watermarkError.message}`)

  return result
}

async function applyGmailStatus(
  supabase: any,
  channel: SyncableChannel,
  threadIds: Set<string>,
  status: "spam" | "deleted",
  cutoff: string,
): Promise<number> {
  let updated = 0
  const allThreadIds = Array.from(threadIds)
  for (let index = 0; index < allThreadIds.length; index += DATABASE_UPDATE_CHUNK) {
    const { data, error: readError } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .neq("status", status)
      .in("gmail_thread_id", allThreadIds.slice(index, index + DATABASE_UPDATE_CHUNK))
      .lte("updated_at", cutoff)
    if (readError) throw new Error(`Gmail ${status} reconciliation read failed: ${readError.message}`)

    const ids = (data || []).map((conversation: any) => conversation.id)
    if (ids.length === 0) continue
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ status })
      .in("id", ids)
      .lte("updated_at", cutoff)
    if (updateError) throw new Error(`Gmail ${status} reconciliation update failed: ${updateError.message}`)
    updated += ids.length
  }
  return updated
}

/**
 * Reconciles spam / trash / restore-to-inbox / read state from Gmail to the app.
 * Gmail is the source of truth for email conversation state. Only touches email
 * conversations of THIS channel — WhatsApp and others are never affected.
 *
 * Mapping: SPAM -> status 'spam', TRASH -> status 'deleted', back in INBOX ->
 * status 'open', UNREAD label -> unread_count.
 *
 * IMPORTANT (read safety): "mark as read" is only applied to threads whose
 * actual labels we observed this run (scannedThreadRead), because a capped
 * is:unread query cannot prove the ABSENCE of the UNREAD label when the mailbox
 * has more unread mail than the cap. "Mark as unread" from the capped unread set
 * is always safe (it is a positive signal).
 */
export async function reconcileChannelStates(
  supabase: any,
  channel: SyncableChannel,
  token: string,
  scannedThreadRead: Map<string, boolean>,
): Promise<{ spam: number; trash: number; restored: number; read: number }> {
  const result = { spam: 0, trash: 0, restored: 0, read: 0 }
  const now = new Date().toISOString()

  const spamSet = await listThreadIds(token, "in:spam", 200)
  const trashSet = await listThreadIds(token, "in:trash", 200)

  // 1) Threads now in SPAM -> mark app conversations 'spam'.
  if (spamSet.size > 0) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .neq("status", "spam")
      .in("gmail_thread_id", Array.from(spamSet))
    const ids = (data || []).map((c: any) => c.id)
    if (ids.length > 0) {
      await supabase.from("conversations").update({ status: "spam", updated_at: now }).in("id", ids)
      result.spam = ids.length
    }
  }

  // 2) Threads now in TRASH -> mark app conversations 'deleted'.
  if (trashSet.size > 0) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .neq("status", "deleted")
      .in("gmail_thread_id", Array.from(trashSet))
    const ids = (data || []).map((c: any) => c.id)
    if (ids.length > 0) {
      await supabase.from("conversations").update({ status: "deleted", updated_at: now }).in("id", ids)
      result.trash = ids.length
    }
  }

  // Do not infer a negative state from these capped result sets. Restores and
  // archive detection are handled by the hourly fully-paginated pass.

  // 3) Read state.
  // 3a) Positive "unread" signal from a capped is:unread query: any of these
  //     threads marked read in the app should become unread. Always safe.
  const unreadSet = await listThreadIds(token, "is:unread in:inbox", 500)
  if (unreadSet.size > 0) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .eq("unread_count", 0)
      .in("gmail_thread_id", Array.from(unreadSet))
    const ids = (data || []).map((c: any) => c.id)
    if (ids.length > 0) {
      await supabase.from("conversations").update({ unread_count: 1, updated_at: now }).in("id", ids)
      result.read += ids.length
    }
  }

  // 3b) Authoritative read-state for threads we actually scanned this run.
  //     Safe to mark BOTH read and unread because we observed the real labels.
  const scannedReadThreadIds = [...scannedThreadRead.entries()].filter(([, u]) => !u).map(([t]) => t)
  if (scannedReadThreadIds.length > 0) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", channel.property_id)
      .eq("channel_id", channel.id)
      .gt("unread_count", 0)
      .in("gmail_thread_id", scannedReadThreadIds)
    const ids = (data || []).map((c: any) => c.id)
    if (ids.length > 0) {
      await supabase.from("conversations").update({ unread_count: 0, updated_at: now }).in("id", ids)
      // Also flip the underlying messages so per-message read state stays coherent.
      await supabase
        .from("messages")
        .update({ status: "read" })
        .in("conversation_id", ids)
        .eq("property_id", channel.property_id)
        .eq("status", "received")
      result.read += ids.length
    }
  }

  return result
}

async function markPollCompleted(supabase: any, channelId: string) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from("email_channels")
    .update({ last_sync_at: now, updated_at: now })
    .eq("id", channelId)
  if (error) throw new Error(`Poll watermark update failed: ${error.message}`)
}
