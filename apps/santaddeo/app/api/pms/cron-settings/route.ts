import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { PerfContext, storePerfLog } from "@/lib/performance/perf-logger"

export async function GET(request: NextRequest) {
  const perf = new PerfContext("/api/pms/cron-settings", "GET")

  try {
    // Use service role to bypass RLS - the API validates hotel access via the request
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId") || searchParams.get("hotel_id")
    const module = searchParams.get("module")

    if (!hotelId) {
      const log = perf.finalize(400)
      storePerfLog(log)
      return NextResponse.json({ error: "hotelId is required" }, { status: 400 })
    }

    perf.setHotelId(hotelId)

    // Build query - filter by module if provided
    let query = supabase.from("pms_cron_settings").select("*").eq("hotel_id", hotelId)
    if (module) {
      query = query.eq("module", module)
    }
    query = query.order("module")

    const { data: settings, error } = await perf.measureDb(
      () => query,
      "SELECT:pms_cron_settings",
    )
    
    // If single module requested, return settings object directly
    if (module && settings && settings.length > 0) {
      const log = perf.finalize(200)
      storePerfLog(log)
      return NextResponse.json({ settings: settings[0] })
    }

    if (error) {
      console.error("[v0] Error fetching cron settings:", error)
      const log = perf.finalize(500, error.message)
      storePerfLog(log)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const log = perf.finalize(200)
    storePerfLog(log)
    return NextResponse.json({ settings: settings || [] })
  } catch (error) {
    console.error("[v0] Error in cron-settings GET:", error)
    const log = perf.finalize(500, error instanceof Error ? error.message : "Unknown error")
    storePerfLog(log)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const perf = new PerfContext("/api/pms/cron-settings", "POST")

  try {
    // Use service role to bypass RLS - same as GET method
    const supabase = await createClient()
    const body = await request.json()

    const { hotelId, module, enabled, frequency, dateFrom, dateTo } = body

    if (!hotelId || !module) {
      const log = perf.finalize(400)
      storePerfLog(log)
      return NextResponse.json({ error: "hotelId and module are required" }, { status: 400 })
    }

    perf.setHotelId(hotelId)

    // Get current setting to calculate next_run from last_run
    const { data: currentSetting } = await supabase
      .from("pms_cron_settings")
      .select("last_run, enabled")
      .eq("hotel_id", hotelId)
      .eq("module", module)
      .maybeSingle()

    const now = new Date()
    let nextRun: Date | null = null

    // Calculate next run based on frequency
    const frequencyMs: Record<string, number> = {
      every_15_min: 15 * 60 * 1000,
      every_30_min: 30 * 60 * 1000,
      hourly: 60 * 60 * 1000,
      every_3_hours: 3 * 60 * 60 * 1000,
      every_6_hours: 6 * 60 * 60 * 1000,
      every_12_hours: 12 * 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    }
    
    const intervalMs = frequencyMs[frequency] || frequencyMs["hourly"]
    
    // If enabled, calculate next run from last_run or from now
    if (enabled !== false) {
      const baseTime = currentSetting?.last_run ? new Date(currentSetting.last_run) : now
      nextRun = new Date(baseTime.getTime() + intervalMs)
      
      // If next_run is in the past, set it to now + interval
      if (nextRun < now) {
        nextRun = new Date(now.getTime() + intervalMs)
      }
    }

    const { data: setting, error } = await perf.measureDb(
      () =>
        supabase
          .from("pms_cron_settings")
          .upsert(
            {
              hotel_id: hotelId,
              module,
              enabled: enabled,
              frequency: frequency || "hourly",
              date_from: dateFrom || null,
              date_to: dateTo || null,
              next_run: nextRun?.toISOString() || null,
              updated_at: now.toISOString(),
            },
            {
              onConflict: "hotel_id,module",
            },
          )
          .select()
          .single(),
      "UPSERT:pms_cron_settings",
    )

    if (error) {
      console.error("[v0] Error saving cron setting:", error)
      const log = perf.finalize(500, error.message)
      storePerfLog(log)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const log = perf.finalize(200)
    storePerfLog(log)
    return NextResponse.json({ success: true, setting })
  } catch (error) {
    console.error("[v0] Error in cron-settings POST:", error)
    const log = perf.finalize(500, error instanceof Error ? error.message : "Unknown error")
    storePerfLog(log)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
