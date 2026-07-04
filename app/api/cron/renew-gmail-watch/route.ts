import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { renewGmailWatch } from "@/lib/email/gmail-watch"

// Cron job per rinnovare le Gmail watch prima della scadenza.
// Gira giornalmente via Vercel Cron.
//
// FIX (03/07/2026): prima faceva un self-fetch a /api/channels/email/watch
// SENZA sessione -> la route richiede auth (getAuthenticatedPropertyId) e
// rispondeva 500 "Non autenticato" ogni notte. Ora il rinnovo avviene
// in-process con service client (stesso pattern di poll-email-inbox), senza
// self-fetch e senza dipendere dalla sessione HTTP.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Guard shared-secret opzionale (parità con poll-email-inbox): se CRON_SECRET
  // è impostato, Vercel Cron lo invia come Bearer token e lo richiediamo.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const supabase = createServiceClient()

    // Canali con watch in scadenza nelle prossime 24h.
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const { data: channels, error } = await supabase
      .from("email_channels")
      .select("id, email_address")
      .eq("provider", "gmail")
      .eq("push_enabled", true)
      .lt("gmail_watch_expiration", tomorrow.toISOString())

    if (error) {
      console.error("[v0][renew-gmail-watch] DB error:", error.message)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    console.log(`[v0][renew-gmail-watch] Renewing ${channels?.length || 0} Gmail watch(es)`)

    let renewed = 0
    let failed = 0
    const results = []

    for (const channel of channels || []) {
      const res = await renewGmailWatch(supabase, channel.id)
      if (res.success) {
        renewed++
        console.log(`[v0][renew-gmail-watch] Renewed: ${res.email}`)
      } else {
        failed++
        console.error(`[v0][renew-gmail-watch] Failed ${res.email}: ${res.error}`)
      }
      results.push(res)
    }

    return NextResponse.json({
      success: true,
      renewed,
      failed,
      total: channels?.length || 0,
      results,
    })
  } catch (error: any) {
    console.error("[v0][renew-gmail-watch] fatal:", error?.message || error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
