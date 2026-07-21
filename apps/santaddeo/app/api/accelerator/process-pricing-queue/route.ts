import { NextRequest, NextResponse } from "next/server"
import { processPendingPricingQueue } from "@/lib/pricing/process-queue"
import { isTransientError, logSupabaseError } from "@/lib/supabase/error-utils"

export const dynamic = "force-dynamic"
// FIX 04/05/2026: bump da 60s a 300s. Un backfill esteso (es. 240gg per
// hotel autopilot con 471 combo room/rate/occ = 113k celle) puo' impiegare
// 1-2 minuti per fare recalc + push autopilot + email. Con 60s il drain
// va in timeout, l'item resta `processing` (pseudo-locked) e l'utente
// non riceve mai il push. 300s e' il cap massimo per Vercel Pro.
export const maxDuration = 300

/**
 * GET /api/accelerator/process-pricing-queue
 *
 * Drains pending items from pricing_recalc_queue. Thin wrapper around
 * lib/pricing/process-queue.ts so the cron sync-and-etl can invoke the
 * same code path inline without depending on a dedicated cron schedule
 * (Vercel Pro drops '* * * * *' schedules at registration time).
 */
export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET for automated calls (skip in dev/preview)
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    const isDev =
      process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"

    if (!isDev && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const results = await processPendingPricingQueue()
    return NextResponse.json(results)
  } catch (error) {
    // FIX 06/06/2026: durante un outage del gateway Supabase (Cloudflare 522)
    // questa route rispondeva 500 e loggava il blob HTML grezzo, mentre i cron
    // (sync-and-etl, sync-modules, expire-prospect-assignments) gia' falliscono
    // in modo pulito con 503. Allineata al pattern fail-fast: outage/timeout ->
    // 503 (transitorio, ritenta al prossimo drain), solo i veri errori -> 500.
    if (isTransientError(error)) {
      logSupabaseError("PRECIO: process-pricing-queue", error)
      return NextResponse.json(
        { error: "service unavailable (upstream outage)", transient: true },
        { status: 503 },
      )
    }
    console.error("[v0] PRECIO: process-pricing-queue error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
