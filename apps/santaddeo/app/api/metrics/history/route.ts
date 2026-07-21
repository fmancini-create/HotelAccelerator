import { createClient } from "@/lib/supabase/server"
import { MetricsHistoryService } from "@/lib/services/metrics-history-service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const hotelId = searchParams.get("hotel_id")
  const startDate = searchParams.get("start_date")
  const endDate = searchParams.get("end_date")
  const eventType = searchParams.get("event_type") as "occupancy" | "production" | "pricing" | "booking" | "cancellation" | undefined
  const roomTypeId = searchParams.get("room_type_id") || undefined

  if (!hotelId || !startDate || !endDate) {
    return NextResponse.json({ error: "hotel_id, start_date, and end_date required" }, { status: 400 })
  }

  try {
    // Check authentication
    const userClient = await createClient()
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await MetricsHistoryService.getHistory(
      hotelId,
      startDate,
      endDate,
      eventType,
      roomTypeId
    )

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error("[MetricsHistory API] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
