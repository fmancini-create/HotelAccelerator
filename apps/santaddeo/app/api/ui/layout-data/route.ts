import { NextResponse } from "next/server"
import { getSettingsData } from "@/lib/settings/get-settings-data"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await getSettingsData()

    if (data.redirect) {
      return NextResponse.json({ redirect: data.redirect })
    }

    return NextResponse.json({
      profile: data.profile || null,
      organization: data.organization || null,
      hotels: data.hotels || [],
      selectedHotel: data.selectedHotel || null,
      isSuperAdmin: data.isSuperAdmin || false,
      isDeveloper: data.isDeveloper || false,
      isImpersonating: data.isImpersonating || false,
      pmsIntegration: data.pmsIntegration || null,
      subscription: data.subscription || null,
      roomTypes: data.roomTypes || [],
      hasMappings: data.hasMappings || false,
      allHotels: data.allHotels || data.hotels || [],
    })
  } catch (error) {
    console.error("[v0] Error in layout-data API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
