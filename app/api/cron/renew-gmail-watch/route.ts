import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Cron job to renew Gmail watches before they expire
// Should run daily via Vercel Cron
export async function GET() {
  try {
    const supabase = await createClient()

    // Find channels with watch expiring in the next 24 hours
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: channels, error } = await supabase
      .from("email_channels")
      .select("id, email_address")
      .eq("provider", "gmail")
      .eq("push_enabled", true)
      .lt("gmail_watch_expiration", tomorrow.toISOString())

    if (error) {
      console.error("[v0] Error fetching channels:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    console.log(`[v0] Renewing ${channels?.length || 0} Gmail watches`)

    let renewed = 0
    let failed = 0

    for (const channel of channels || []) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/watch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: channel.id }),
        })

        if (response.ok) {
          renewed++
          console.log(`[v0] Renewed watch for: ${channel.email_address}`)
        } else {
          failed++
          console.error(`[v0] Failed to renew watch for: ${channel.email_address}`)
        }
      } catch (err) {
        failed++
        console.error(`[v0] Error renewing watch:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      renewed,
      failed,
      total: channels?.length || 0,
    })
  } catch (error) {
    console.error("[v0] Cron error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// Vercel Cron config
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
