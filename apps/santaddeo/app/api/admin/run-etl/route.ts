import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ETLOrchestrator } from "@/lib/etl/etl-orchestrator"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()

    // Verify superadmin access
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || profile.role !== "system_admin") {
      return NextResponse.json({ error: "Forbidden - SuperAdmin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { hotel_id } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    console.log("[v0] SuperAdmin ETL: Starting manual ETL for hotel", hotel_id)

    // Run ETL for the specified hotel (guard is inside ETLOrchestrator)
    const orchestrator = new ETLOrchestrator({
      hotel_id,
      job_type: "full_sync",
      triggered_by: "superadmin",
      triggered_by_user: user.id,
    })

    const result = await orchestrator.run()

    if (result.blocked) {
      console.warn("[v0] SuperAdmin ETL BLOCKED:", result.block_reason)
      return NextResponse.json(
        {
          status: "BLOCKED",
          reason: result.block_reason,
          message:
            "ETL bloccato anche per SuperAdmin. La mappatura deve essere VALIDATED/LOCKED e il binding COMPLETE/ACTIVE.",
        },
        { status: 403 },
      )
    }
    // </CHANGE>

    console.log("[v0] SuperAdmin ETL: Completed", result)

    return NextResponse.json({
      status: "OK",
      records_loaded: result.results.bookings?.records_inserted || 0,
      job_id: result.job_id,
      results: result.results,
    })
  } catch (error) {
    console.error("[v0] SuperAdmin ETL error:", error)
    return NextResponse.json(
      {
        status: "ERROR",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
