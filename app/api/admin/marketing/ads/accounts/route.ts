import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("advertising_accounts")
      .select("id, provider, external_account_id, name, currency, timezone, status, connection_mode, last_synced_at, last_error, metadata")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: true })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching advertising accounts:", error)
    return NextResponse.json({ error: "Failed to fetch advertising accounts" }, { status: 500 })
  }
}
