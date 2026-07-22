import { type NextRequest, NextResponse } from "next/server"
import { getKPIs, getAggregatedKPIs } from "@/lib/services/kpi-calculation-service"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const aggregate = searchParams.get("aggregate") === "true"

    if (!hotelId || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required parameters: hotelId, startDate, endDate" }, { status: 400 })
    }

    if (aggregate) {
      const kpis = await getAggregatedKPIs({ hotelId, startDate, endDate })
      return NextResponse.json(kpis)
    } else {
      const kpis = await getKPIs({ hotelId, startDate, endDate })
      return NextResponse.json({ kpis })
    }
  } catch (error) {
    console.error("Error fetching KPIs:", error)
    return NextResponse.json({ error: "Failed to fetch KPIs" }, { status: 500 })
  }
}
