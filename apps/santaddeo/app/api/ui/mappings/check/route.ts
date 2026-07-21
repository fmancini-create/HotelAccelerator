import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ hasMappings: false })
    }

    // Get hotel_id from query params
    const url = new URL(request.url)
    const hotelId = url.searchParams.get("hotelId")

    if (!hotelId) {
      return NextResponse.json({ hasMappings: false })
    }

    // Prima controlla se il tenant ha una pms_integration attiva (GDocs o API)
    const { data: pmsIntegration } = await supabase
      .from("pms_integrations")
      .select("id, is_active, integration_mode")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    let hasMappings = false

    if (pmsIntegration?.is_active && pmsIntegration?.integration_mode) {
      hasMappings = true
    } else {
      // Fallback: controlla mappature PMS->RMS (hotel-specific o globali)
      const { data: mappingsData, error: mappingsErr } = await supabase
        .from("pms_rms_mappings")
        .select("id")
        .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
        .in("pms_entity_type", ["room_type", "rate_plan"])
        .limit(1)
      hasMappings = !mappingsErr && (mappingsData?.length ?? 0) > 0
    }

    return NextResponse.json({ hasMappings })
  } catch (error) {
    console.error("[v0] Error checking mappings:", error)
    return NextResponse.json({ hasMappings: false })
  }
}
