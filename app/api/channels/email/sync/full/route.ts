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
import { getValidGmailToken } from "@/lib/gmail-client"
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
        "id, property_id, provider, is_active, full_sync_status, full_sync_page_token, full_sync_processed, full_sync_imported, full_sync_duplicates, full_sync_errors",
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

    if (shouldReset) {
      await supabase
        .from("email_channels")
        .update({
          full_sync_status: "running",
          full_sync_page_token: null,
          full_sync_processed: 0,
          full_sync_imported: 0,
          full_sync_duplicates: 0,
          full_sync_errors: 0,
          full_sync_started_at: new Date().toISOString(),
          full_sync_completed_at: null,
          full_sync_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", channelId)
    }

    // Refresh Gmail token
    const { token, error: tokenError } = await getValidGmailToken(channelId)
    if (!token) {
      await markFailed(supabase, channelId, tokenError || "Token Gmail non valido")
      return NextResponse.json({ error: tokenError || "Token Gmail non valido" }, { status: 401 })
    }

    // List one page (all mail, no filter) -> matches what Gmail shows across all folders
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages")
    listUrl.searchParams.set("maxResults", String(PAGE_SIZE))
    // No q param => returns ALL messages (equivalent to "All Mail" in Gmail)
    if (pageToken) listUrl.searchParams.set("pageToken", pageToken)

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!listRes.ok) {
      const errText = await safeReadText(listRes)
      if (listRes.status === 429) {
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
      await markFailed(supabase, channelId, `Gmail list HTTP ${listRes.status}: ${errText}`)
      return NextResponse.json(
        { error: `Errore Gmail list: ${listRes.status}` },
        { status: 502 },
      )
    }

    const listData = await listRes.json()
    const ids: Array<{ id: string }> = listData.messages || []
    const nextPageToken: string | null = listData.nextPageToken || null

    // Process each id: fetch full message + run EmailProcessor
    const processor = new EmailProcessor(supabase)

    for (const { id } of ids) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (msgRes.status === 429) {
          // stop processing this batch, persist what we have, tell client to retry
          break
        }
        if (!msgRes.ok) {
          errors++
          processed++
          continue
        }
        const msgData = await msgRes.json()
        const parsed = parseGmailMessage(msgData)
        const result = await processor.processInboundEmail(parsed, channelId, propertyId)
        if (result?.success) {
          if (result.isDuplicate) duplicates++
          else imported++
        } else {
          errors++
        }
        processed++
        if (PER_MESSAGE_DELAY_MS > 0) {
          await new Promise((r) => setTimeout(r, PER_MESSAGE_DELAY_MS))
        }
      } catch (e) {
        console.error("[v0][full-sync] message error:", e)
        errors++
        processed++
      }
    }

    const done = !nextPageToken
    const nextStatus: SyncStatus = done ? "completed" : "running"

    await supabase
      .from("email_channels")
      .update({
        full_sync_status: nextStatus,
        full_sync_page_token: done ? null : nextPageToken,
        full_sync_processed: processed,
        full_sync_imported: imported,
        full_sync_duplicates: duplicates,
        full_sync_errors: errors,
        full_sync_completed_at: done ? new Date().toISOString() : null,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channelId)

    return NextResponse.json({
      done,
      status: nextStatus,
      processed,
      imported,
      duplicates,
      errors,
      batch_size: ids.length,
    })
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
      in_progress: Boolean(channel.full_sync_page_token),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore" }, { status: 500 })
  }
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

async function safeReadText(res: Response) {
  try {
    return (await res.text()).slice(0, 400)
  } catch {
    return ""
  }
}
