// Full historical sync - resumable, paginated.
// Each POST call processes ONE page (50 messages) and returns the job status.
// The client loops calling this endpoint until `done === true`.
//
// Design goals:
// - Resumable across browser refresh / network error (state in DB).
// - Safe under 60s serverless timeout (<=50 msgs per run, ~20s worst case).
// - Idempotent (EmailProcessor deduplicates by external_message_id).
// - Multi-tenant (channel must belong to the authenticated property).

import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidGmailToken, gmailFetchWithToken } from "@/lib/gmail-client"
import { EmailProcessor } from "@/lib/email/email-processor"
import { parseGmailMessage } from "@/lib/email/gmail-parse"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

const PAGE_SIZE = 50 // Gmail list API page
const PER_MESSAGE_DELAY_MS = 40 // gentle on quota

type SyncStatus = "idle" | "running" | "completed" | "failed"

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json().catch(() => ({}))
    const channelId: string | undefined = body?.channel_id
    const reset: boolean = Boolean(body?.reset)

    if (!channelId) {
      return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: channel } = await supabase
      .from("email_channels")
      .select(
        "id, property_id, provider, is_active, gmail_history_id, full_sync_status, full_sync_page_token, full_sync_processed, full_sync_imported, full_sync_duplicates, full_sync_errors, full_sync_started_at, full_sync_start_history_id",
      )
      .eq("id", channelId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }
    if (channel.provider !== "gmail") {
      return NextResponse.json(
        { error: "Sync storico disponibile solo per canali Gmail" },
        { status: 400 },
      )
    }

    // Decide if we are starting fresh or resuming
    const previousStatus = (channel.full_sync_status || "idle") as SyncStatus
    const shouldReset =
      reset || previousStatus === "idle" || previousStatus === "completed" || previousStatus === "failed"

    let pageToken: string | null = shouldReset ? null : channel.full_sync_page_token || null
    let processed: number = shouldReset ? 0 : channel.full_sync_processed || 0
    let imported: number = shouldReset ? 0 : channel.full_sync_imported || 0
    let duplicates: number = shouldReset ? 0 : channel.full_sync_duplicates || 0
    let errors: number = shouldReset ? 0 : channel.full_sync_errors || 0
    const fullSyncStartedAt = shouldReset
      ? new Date().toISOString()
      : channel.full_sync_started_at || new Date().toISOString()

    const tokenResult = await getValidGmailToken(channelId, supabase)
    if (!tokenResult.token) {
      if (tokenResult.reconnectRequired) {
        await markFailed(supabase, channelId, tokenResult.error || "Token Gmail non valido")
      }
      return NextResponse.json(
        {
          error: tokenResult.error || "Token Gmail non valido",
          code: tokenResult.reconnectRequired ? "GMAIL_RECONNECT_REQUIRED" : "GMAIL_TEMPORARILY_UNAVAILABLE",
        },
        { status: tokenResult.reconnectRequired ? 401 : tokenResult.status === 429 ? 429 : 503 },
      )
    }
    const token = tokenResult.token

    let fullSyncStartHistoryId: string | null = shouldReset
      ? null
      : channel.full_sync_start_history_id
        ? String(channel.full_sync_start_history_id)
        : null

    if (!fullSyncStartHistoryId) {
      const { data: profile, error: profileError, status: profileStatus } = await gmailFetchWithToken(token, "profile")
      if (!profile?.historyId || profileError) {
        return NextResponse.json(
          {
            error: profileError || "Cursor Gmail iniziale non disponibile",
            code: profileStatus === 401 ? "GMAIL_RECONNECT_REQUIRED" : "GMAIL_TEMPORARILY_UNAVAILABLE",
          },
          { status: profileStatus === 401 ? 401 : profileStatus === 429 ? 429 : 503 },
        )
      }
      fullSyncStartHistoryId = String(profile.historyId)
    }

    if (shouldReset) {
      const { error: resetError } = await supabase
        .from("email_channels")
        .update({
          full_sync_status: "running",
          full_sync_page_token: null,
          full_sync_processed: 0,
          full_sync_imported: 0,
          full_sync_duplicates: 0,
          full_sync_errors: 0,
          full_sync_started_at: fullSyncStartedAt,
          full_sync_start_history_id: fullSyncStartHistoryId,
          full_sync_completed_at: null,
          full_sync_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", channelId)
      if (resetError) {
        return NextResponse.json(
          { error: "Impossibile inizializzare la sincronizzazione storica", code: "DATABASE_UNAVAILABLE" },
          { status: 503 },
        )
      }
    } else if (!channel.full_sync_start_history_id) {
      const { error: startCursorError } = await supabase
        .from("email_channels")
        .update({
          full_sync_start_history_id: fullSyncStartHistoryId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", channelId)
      if (startCursorError) {
        return NextResponse.json(
          { error: "Impossibile salvare il cursor iniziale Gmail", code: "DATABASE_UNAVAILABLE" },
          { status: 503 },
        )
      }
    }

    // List one page (all mail, no filter) -> matches what Gmail shows across all folders
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    listUrl.searchParams.set("maxResults", String(PAGE_SIZE))
    // No q param => returns ALL messages (equivalent to "All Mail" in Gmail)
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken)

    const { data: listData, error: listError, status: listStatus } = await gmailFetchWithToken(
      token,
      listUrl.toString(),
    )

    if (listError || !listData) {
      if (listStatus === 429) {
        // Rate limited: do NOT fail the job, let user retry
        return NextResponse.json(
          {
            done: false,
            status: "running",
            processed,
            imported,
            duplicates,
            errors,
            rateLimited: true,
            message: "Gmail rate limit raggiunto, riprova tra qualche secondo.",
          },
          { status: 429 },
        )
      }
      if (listStatus === 401) {
        await markFailed(supabase, channelId, listError || "Autorizzazione Gmail revocata")
      } else {
        await recordRetryableError(supabase, channelId, listError || `Gmail list HTTP ${listStatus}`)
      }
      return NextResponse.json(
        {
          error: listError || `Errore Gmail list: ${listStatus}`,
          code: listStatus === 401 ? "GMAIL_RECONNECT_REQUIRED" : "GMAIL_TEMPORARILY_UNAVAILABLE",
        },
        { status: listStatus === 401 ? 401 : 503 },
      )
    }

    const ids: Array<{ id: string }> = listData.messages || []
    const nextPageToken: string | null = listData.nextPageToken || null
    let pageComplete = true
    let rateLimited = false
    let skipped = 0
    let pageError: string | null = null

    // Process each id: fetch full message + run EmailProcessor
    const processor = new EmailProcessor(supabase)

    for (const { id } of ids) {
      try {
        const { data: msgData, error: messageError, status: messageStatus } = await gmailFetchWithToken(
          token,
          `messages/${id}?format=full`,
        )
        if (messageStatus === 429) {
          pageComplete = false
          rateLimited = true
          pageError = messageError || "Limite temporaneo Gmail raggiunto"
          break
        }
        if (messageError || !msgData) {
          errors++
          pageComplete = false
          pageError = messageError || `Messaggio Gmail HTTP ${messageStatus}`
          break
        }

        const labels: string[] = Array.isArray(msgData.labelIds) ? msgData.labelIds : []
        if (labels.includes("SENT") || labels.includes("DRAFT")) {
          // EmailProcessor models inbound customer mail. Importing Sent/Draft
          // through it created fake customer messages and corrupted unread/KPI.
          skipped++
          processed++
          continue
        }

        const parsed = parseGmailMessage(msgData)
        const result = await processor.processInboundEmail(parsed, channelId, propertyId)
        if (result?.success) {
          if (result.isDuplicate) duplicates++
          else imported++
        } else {
          errors++
          pageComplete = false
          pageError = result?.error || "Elaborazione messaggio fallita"
          break
        }
        processed++
        if (PER_MESSAGE_DELAY_MS > 0) {
          await new Promise((r) => setTimeout(r, PER_MESSAGE_DELAY_MS))
        }
      } catch (e) {
        console.error("[v0][full-sync] message error:", e)
        errors++
        pageComplete = false
        pageError = e instanceof Error ? e.message : String(e)
        break
      }
    }

    if (pageComplete && !nextPageToken) {
      const cursorPromoted = await promoteFullSyncCursor(
        supabase,
        channelId,
        fullSyncStartHistoryId,
        fullSyncStartedAt,
      )
      if (!cursorPromoted) {
        pageComplete = false
        pageError = "Impossibile rendere durevole il cursor Gmail della sincronizzazione storica"
      }
    }

    const done = pageComplete && !nextPageToken
    const nextStatus: SyncStatus = done ? "completed" : "running"
    const nextStoredPageToken = pageComplete ? nextPageToken : pageToken
    const now = new Date().toISOString()

    const { error: progressError } = await supabase
      .from("email_channels")
      .update({
        full_sync_status: nextStatus,
        full_sync_page_token: done ? null : nextStoredPageToken,
        full_sync_processed: processed,
        full_sync_imported: imported,
        full_sync_duplicates: duplicates,
        full_sync_errors: errors,
        full_sync_completed_at: done ? now : null,
        full_sync_last_error: pageError ? pageError.slice(0, 1000) : null,
        ...(done && { full_sync_start_history_id: null }),
        updated_at: now,
      })
      .eq("id", channelId)

    if (progressError) {
      return NextResponse.json(
        { error: "Impossibile salvare l'avanzamento della sincronizzazione", code: "DATABASE_UNAVAILABLE" },
        { status: 503 },
      )
    }

    return NextResponse.json(
      {
        done,
        status: nextStatus,
        processed,
        imported,
        duplicates,
        errors,
        skipped,
        batch_size: ids.length,
        retryable: !pageComplete,
        error: pageError,
      },
      { status: rateLimited ? 429 : pageComplete ? 200 : 503 },
    )
  } catch (error: any) {
    console.error("[v0][full-sync] fatal:", error)
    return NextResponse.json(
      { error: error?.message || "Errore durante la sincronizzazione storica" },
      { status: 500 },
    )
  }
}

// GET returns the current progress snapshot without advancing the job.
// Used by the client to poll progress or show the last run status.
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get("channel_id")
    if (!channelId) {
      return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: channel } = await supabase
      .from("email_channels")
      .select(
        "id, property_id, full_sync_status, full_sync_page_token, full_sync_processed, full_sync_imported, full_sync_duplicates, full_sync_errors, full_sync_started_at, full_sync_completed_at, full_sync_last_error",
      )
      .eq("id", channelId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (!channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    return NextResponse.json({
      status: channel.full_sync_status,
      processed: channel.full_sync_processed,
      imported: channel.full_sync_imported,
      duplicates: channel.full_sync_duplicates,
      errors: channel.full_sync_errors,
      started_at: channel.full_sync_started_at,
      completed_at: channel.full_sync_completed_at,
      last_error: channel.full_sync_last_error,
      in_progress: channel.full_sync_status === "running",
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore" }, { status: 500 })
  }
}

function isHistoryAfter(candidate: string | number | null, current: string | number | null): boolean {
  if (candidate === null || candidate === undefined) return false
  if (current === null || current === undefined) return true
  try {
    return BigInt(candidate) > BigInt(current)
  } catch {
    return Number(candidate) > Number(current)
  }
}

async function promoteFullSyncCursor(
  supabase: any,
  channelId: string,
  startHistoryId: string,
  fullSyncStartedAt: string,
): Promise<boolean> {
  const { data: current, error: currentError } = await supabase
    .from("email_channels")
    .select("gmail_history_id")
    .eq("id", channelId)
    .maybeSingle()
  if (currentError || !current) return false

  if (isHistoryAfter(startHistoryId, current.gmail_history_id)) {
    let query = supabase
      .from("email_channels")
      .update({ gmail_history_id: startHistoryId, updated_at: new Date().toISOString() })
      .eq("id", channelId)
    query =
      current.gmail_history_id === null
        ? query.is("gmail_history_id", null)
        : query.eq("gmail_history_id", current.gmail_history_id)

    const { data: updated, error: updateError } = await query.select("id").maybeSingle()
    if (updateError) return false
    if (!updated) {
      const { data: concurrent, error: concurrentError } = await supabase
        .from("email_channels")
        .select("gmail_history_id")
        .eq("id", channelId)
        .maybeSingle()
      if (concurrentError || isHistoryAfter(startHistoryId, concurrent?.gmail_history_id ?? null)) return false
    }
  }

  // Resume polling from the beginning of the historical scan, not its end.
  // Any mail received while the paginated scan was running remains eligible
  // for both the webhook history query and the polling overlap.
  const { error: watermarkError } = await supabase
    .from("email_channels")
    .update({ last_sync_at: fullSyncStartedAt, updated_at: new Date().toISOString() })
    .eq("id", channelId)
  return !watermarkError
}

async function recordRetryableError(supabase: any, channelId: string, error: string) {
  await supabase
    .from("email_channels")
    .update({
      full_sync_status: "running",
      full_sync_last_error: error.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)
}

async function markFailed(supabase: any, channelId: string, error: string) {
  await supabase
    .from("email_channels")
    .update({
      full_sync_status: "failed",
      full_sync_last_error: error.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", channelId)
}
