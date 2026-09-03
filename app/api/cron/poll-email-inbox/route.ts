import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { syncChannelIncremental, type SyncableChannel } from "@/lib/email/incremental-sync"
import { processEmailAiTasks, type EmailAiTask } from "@/lib/ai/channels/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const startedAt = Date.now()

  try {
    const supabase = createServiceClient()

    const { data: channels, error } = await supabase
      .from("email_channels")
      .select(
        "id, property_id, provider, email_address, oauth_access_token, oauth_refresh_token, oauth_expiry, created_at, last_sync_at, gmail_state_reconciled_at",
      )
      .eq("provider", "gmail")
      .eq("is_active", true)
      .eq("sync_enabled", true)

    if (error) {
      console.error("[v0][poll-email] DB error:", error.message)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    const list = (channels || []) as SyncableChannel[]
    console.log(`[v0][poll-email] Polling ${list.length} channel(s)`)

    const results = []
    let totalImported = 0
    for (const channel of list) {
      const channelStartedAt = new Date().toISOString()
      try {
        const res = await syncChannelIncremental(supabase, channel)
        totalImported += res.imported

        if (res.imported > 0) {
          const { data: freshMessages, error: freshError } = await supabase
            .from("messages")
            .select(
              "conversation_id, external_message_id, content, content_type, metadata, conversations!inner(gmail_thread_id, channel_id)",
            )
            .eq("property_id", channel.property_id)
            .eq("sender_type", "customer")
            .eq("conversations.channel_id", channel.id)
            .gte("stored_at", channelStartedAt)
            .not("external_message_id", "is", null)
            .order("stored_at", { ascending: true })

          if (freshError) {
            console.error(`[v0][poll-email] ${res.email}: AI task lookup failed: ${freshError.message}`)
          } else if (freshMessages?.length) {
            const aiTasks: EmailAiTask[] = freshMessages.map((message: any) => ({
              conversationId: message.conversation_id,
              fromHeader: String(message.metadata?.from || ""),
              subject: String(message.metadata?.subject || ""),
              threadId: message.conversations?.gmail_thread_id || undefined,
              externalId: message.external_message_id || undefined,
              body: String(message.content || ""),
              contentType: message.content_type === "html" ? "html" : "text",
            }))
            await processEmailAiTasks(supabase, channel.id, channel.property_id, aiTasks)
          }
        }

        if (res.error) {
          console.error(`[v0][poll-email] ${res.email}: ${res.error}`)
        } else {
          const riconciliazioniFallite = res.reconcileFailures?.length
            ? ` reconcile-FALLITE=${res.reconcileFailures.join(",")}`
            : ""
          console.log(
            `[v0][poll-email] ${res.email}: scanned=${res.scanned} imported=${res.imported} dup=${res.duplicates} err=${res.errors} stars+${res.starsAdded ?? 0}/-${res.starsRemoved ?? 0} spam=${res.spamSynced ?? 0} trash=${res.trashSynced ?? 0} restored=${res.restored ?? 0} read=${res.readSynced ?? 0}${riconciliazioniFallite}`,
          )
        }
        results.push(res)
      } catch (channelError) {
        const message = channelError instanceof Error ? channelError.message : String(channelError)
        console.error(`[v0][poll-email] channel ${channel.id} failed: ${message}`)
        results.push({
          channelId: channel.id,
          email: channel.email_address,
          imported: 0,
          duplicates: 0,
          errors: 1,
          scanned: 0,
          error: message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      channels: list.length,
      totalImported,
      durationMs: Date.now() - startedAt,
      results,
    })
  } catch (err: any) {
    console.error("[v0][poll-email] fatal:", err?.message || err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
