import { type NextRequest, NextResponse } from "next/server"
import { ApifyReviewService } from "@/lib/services/apify-review-service"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { createServiceRoleClient } from "@/lib/supabase/server"

// 5-minute cap; in practice a single-platform sync finishes in ~60-120s.
export const maxDuration = 300

const VALID_PLATFORMS = ["google", "booking", "tripadvisor", "expedia", "vrbo", "airbnb"] as const
type Platform = (typeof VALID_PLATFORMS)[number]

/**
 * GET /api/integrations/reviews/sync?hotelId=...
 * Returns the list of platforms configured for this hotel so the client
 * can orchestrate one call per platform.
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotelId")
    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })
    }

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied

    const result = await ApifyReviewService.getConfiguredPlatforms(hotelId)
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, platforms: result.platforms ?? [] })
  } catch (error) {
    console.error("[v0] Error listing configured platforms:", error)
    return NextResponse.json({ error: "Failed to list platforms" }, { status: 500 })
  }
}

/**
 * POST /api/integrations/reviews/sync
 * Body: { hotelId, platform?: "google" | "booking" | "tripadvisor" | "expedia" }
 *
 * - If `platform` is provided, syncs ONLY that platform (fits in 300s budget).
 * - If omitted, syncs all configured platforms sequentially (may hit limits
 *   if 3+ platforms are configured — prefer calling per-platform from the UI).
 */
export async function POST(request: NextRequest) {
  try {
    const { hotelId, platform, forceFull } = await request.json()

    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })
    }

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied

    // Per-platform path (recommended)
    if (platform) {
      if (!VALID_PLATFORMS.includes(platform as Platform)) {
        return NextResponse.json(
          { error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}` },
          { status: 400 }
        )
      }
      const result = await ApifyReviewService.syncSinglePlatformForHotel(
        hotelId,
        platform as Platform,
        { forceFull: Boolean(forceFull) }
      )

      // SCHEDULE-DRIVEN: aggiorniamo review_platform_schedules anche per le
      // sync manuali, cosi':
      //  - se l'utente trova nuove review il counter empty_runs si azzera
      //    e il canale "respira" prima di tornare dormiente.
      //  - se non trova nulla, NON incrementiamo empty_runs (la sync manuale
      //    e' best-effort dell'utente, non un proxy di "canale morto").
      //  - posticipiamo next_sync_at di 1 cadenza per evitare che il cron
      //    rifaccia la stessa sync subito dopo la manuale.
      try {
        const admin = await createServiceRoleClient()
        const { data: sched } = await admin
          .from("review_platform_schedules")
          .select(
            "id, avg_days_between_reviews, manual_override_days, consecutive_empty_runs"
          )
          .eq("hotel_id", hotelId)
          .eq("platform", platform)
          .maybeSingle()
        if (sched) {
          const cadenceDays =
            Number(sched.manual_override_days ?? sched.avg_days_between_reviews) || 7
          const newCount = result.newCount ?? 0
          await admin
            .from("review_platform_schedules")
            .update({
              last_sync_at: new Date().toISOString(),
              last_review_found_at: newCount > 0 ? new Date().toISOString() : undefined,
              next_sync_at: new Date(
                Date.now() + cadenceDays * 24 * 3600 * 1000
              ).toISOString(),
              consecutive_empty_runs: newCount > 0 ? 0 : sched.consecutive_empty_runs,
              total_reviews_found: undefined, // lasciamo invariato; il cron lo gestisce
            })
            .eq("id", sched.id)
          await admin.from("review_sync_runs").insert({
            schedule_id: sched.id,
            hotel_id: hotelId,
            platform,
            finished_at: new Date().toISOString(),
            status: result.success ? (newCount > 0 ? "success" : "success_empty") : "error",
            new_reviews_count: newCount,
            total_reviews_seen: result.reviewCount ?? 0,
            error_message: result.success ? null : result.message,
            trigger_source: "manual_tenant",
          })
        }
      } catch (scheduleErr) {
        console.error("[reviews/sync] schedule update failed", scheduleErr)
      }

      if (!result.success) {
        return NextResponse.json({ error: result.message, platform }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        platform: result.platform,
        message: result.message,
        syncedCount: result.reviewCount ?? 0,
        newReviews: result.newCount ?? 0,
      })
    }

    // Full sync (all configured platforms sequentially)
    const result = await ApifyReviewService.syncReviewsForHotel(hotelId)
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      message: result.message,
      syncedCount: result.reviewCount ?? 0,
      newReviews: result.newCount ?? 0,
      perPlatform: result.perPlatform ?? {},
    })
  } catch (error) {
    console.error("[v0] Error in review sync API:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync reviews" },
      { status: 500 }
    )
  }
}
