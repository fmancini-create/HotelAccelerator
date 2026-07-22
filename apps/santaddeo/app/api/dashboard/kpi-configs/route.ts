import { type NextRequest, NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

// Security: uses cookie-based auth client (respects RLS)
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hotelId = request.nextUrl.searchParams.get("hotel_id")
  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("dashboard_kpi_configs")
    .select("kpi_key, is_enabled")
    .eq("hotel_id", hotelId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Convert to a map { kpi_key: boolean }
  const kpiMap: Record<string, boolean> = {}
  for (const row of data || []) {
    kpiMap[row.kpi_key] = row.is_enabled
  }

  return NextResponse.json({ kpiConfigs: kpiMap })
}
