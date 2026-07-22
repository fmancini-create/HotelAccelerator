import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/guard/config?hotelId=xxx
 * Returns guard tolerance configuration.
 *
 * PATCH /api/guard/config
 * Updates guard tolerance.
 * Body: { hotelId: string, tolerancePct: number }
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = new URL(request.url).searchParams.get("hotelId")
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data } = await supabase
      .from("autopilot_configs")
      .select("guard_tolerance_pct, guard_time_tolerance_min, guard_rate_scope, mode, last_full_sync_at, last_push_at")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    return NextResponse.json({
      tolerancePct: data?.guard_tolerance_pct ?? 5.0,
      timeToleranceMin: data?.guard_time_tolerance_min ?? 60,
      rateScope: data?.guard_rate_scope ?? "active",
      autopilotMode: data?.mode ?? "disabled",
      lastFullSyncAt: data?.last_full_sync_at ?? null,
      lastPushAt: data?.last_push_at ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotelId, tolerancePct, timeToleranceMin, rateScope } = body as {
      hotelId: string
      tolerancePct?: number
      timeToleranceMin?: number
      rateScope?: string
    }

    if (!hotelId) {
      return NextResponse.json(
        { error: "hotelId required" },
        { status: 400 }
      )
    }

    if (tolerancePct === undefined && timeToleranceMin === undefined && rateScope === undefined) {
      return NextResponse.json(
        { error: "At least one of tolerancePct, timeToleranceMin or rateScope required" },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (tolerancePct !== undefined) {
      if (tolerancePct < 0 || tolerancePct > 100) {
        return NextResponse.json(
          { error: "tolerancePct must be between 0 and 100" },
          { status: 400 }
        )
      }
      updates.guard_tolerance_pct = tolerancePct
    }

    if (timeToleranceMin !== undefined) {
      if (!Number.isFinite(timeToleranceMin) || timeToleranceMin < 0 || timeToleranceMin > 1440) {
        return NextResponse.json(
          { error: "timeToleranceMin must be between 0 and 1440 (minutes)" },
          { status: 400 }
        )
      }
      updates.guard_time_tolerance_min = Math.round(timeToleranceMin)
    }

    if (rateScope !== undefined) {
      if (rateScope !== "active" && rateScope !== "all") {
        return NextResponse.json(
          { error: "rateScope must be 'active' or 'all'" },
          { status: 400 }
        )
      }
      updates.guard_rate_scope = rateScope
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from("autopilot_configs")
      .update(updates)
      .eq("hotel_id", hotelId)

    if (error) {
      return NextResponse.json(
        { error: `Errore aggiornamento: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, ...updates })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}
