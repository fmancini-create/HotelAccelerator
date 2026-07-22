import { type NextRequest, NextResponse } from "next/server"
import { linkCallRecaps } from "@/lib/sales/call-recaps"
import { requireCronAuth } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * CRON: collega il riepilogo delle call (note di Gemini + registrazione,
 * allegate automaticamente all'evento Google Calendar) alla cronologia del
 * lead corrispondente (match esatto demo_requests.google_event_id).
 *
 * Schedule consigliato: ogni 30 minuti.
 * Idempotente: una sola voce per evento (dedup su metadata.recap_event_id).
 *
 * Auth: Bearer CRON_SECRET come gli altri cron; in assenza del segreto in env
 * (dev) l'endpoint resta aperto per i test manuali.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  console.log("[link-call-recaps] starting")
  try {
    const result = await linkCallRecaps({ sinceDays: 30 })
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "link_failed"
    console.error("[link-call-recaps] error:", msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
