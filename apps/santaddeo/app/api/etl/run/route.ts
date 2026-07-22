// API endpoint to trigger ETL process
// POST /api/etl/run
// ARCHITECTURE RULE: ETL is BLOCKED if mapping is not VALIDATED/LOCKED

import { type NextRequest, NextResponse } from "next/server"
import { ETLOrchestrator } from "@/lib/etl/etl-orchestrator"
import type { ETLJobConfig } from "@/lib/etl/types"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    // Auth guard: accept Bearer CRON_SECRET (legitimate cron invocations)
    // OR an authenticated Supabase session (for the UI "Sync Now" button).
    // This endpoint was previously unauthenticated and was being hit by an
    // unknown external scheduler creating ~192 ghost etl_jobs rows per day.
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    const isValidBearer = !!cronSecret && authHeader === `Bearer ${cronSecret}`

    if (!isValidBearer) {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const body = await request.json()
    const { hotel_id, job_type, date_from, date_to, triggered_by, triggered_by_user } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    const config: ETLJobConfig = {
      hotel_id,
      job_type: job_type || "full_sync",
      date_from,
      date_to,
      triggered_by: triggered_by || "api",
      triggered_by_user,
    }

    const orchestrator = new ETLOrchestrator(config)
    const result = await orchestrator.run()

    if (result.blocked) {
      return NextResponse.json(
        {
          success: false,
          blocked: true,
          reason: result.block_reason,
          message: "ETL bloccato: la mappatura PMS non è validata o il binding hotel non è completo",
        },
        { status: 403 },
      )
    }
    // </CHANGE>

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error("[v0] ETL API error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
