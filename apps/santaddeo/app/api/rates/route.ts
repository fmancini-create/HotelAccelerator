import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { measureRoute } from "@/lib/performance/with-perf"

async function _GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotel_id")

    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    console.log("[v0] Rates API - Loading rates for hotel:", hotelId)

    const supabase = await createClient()

    const { data, error, count } = await supabase.from("rates").select("*", { count: "exact" }).eq("hotel_id", hotelId)

    console.log("[v0] Rates API - Query result:", { count, error: error?.message, dataLength: data?.length })

    if (error) {
      console.error("[v0] Rates API - Error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rates: data || [], count })
  } catch (error) {
    console.error("[v0] Rates API - Unexpected error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rates" },
      { status: 500 },
    )
  }
}

export const GET = measureRoute("/api/rates", _GET)
