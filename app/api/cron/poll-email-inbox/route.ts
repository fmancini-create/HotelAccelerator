import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { syncChannelIncremental, type SyncableChannel } from "@/lib/email/incremental-sync"

// Reliable email polling cron.
// Runs frequently (see vercel.json) and pulls new mail for every active,
// sync-enabled Gmail channel — independent of Gmail push (Pub/Sub) delivery.
// This is the safety net that keeps the unified inbox flowing even when the
// real-time webhook pipeline is down.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Optional shared-secret guard. If CRON_SECRET is set, require it (Vercel Cron
  // sends it as a Bearer token). If unset, allow (keeps parity with existing crons).
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
        "id, property_id, provider, email_address, oauth_access_token, oauth_refresh_token, oauth_expiry",
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
      const res = await syncChannelIncremental(supabase, channel)
      totalImported += res.imported
      if (res.error) {
        console.error(`[v0][poll-email] ${res.email}: ${res.error}`)
      } else {
        console.log(
          `[v0][poll-email] ${res.email}: scanned=${res.scanned} imported=${res.imported} dup=${res.duplicates} err=${res.errors} stars+${res.starsAdded ?? 0}/-${res.starsRemoved ?? 0} spam=${res.spamSynced ?? 0} trash=${res.trashSynced ?? 0} restored=${res.restored ?? 0} read=${res.readSynced ?? 0}`,
        )
      }
      results.push(res)
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

// Allow manual trigger via POST as well (e.g. a "Sincronizza ora" button).
export async function POST(request: NextRequest) {
  return GET(request)
}
