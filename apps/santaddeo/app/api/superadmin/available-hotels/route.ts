import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const pmsProviderId = searchParams.get("pms_provider_id")

  try {
    // Get all hotels
    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, name")
      .order("name", { ascending: true })

    if (hotelsError) {
      console.error("Error fetching hotels:", hotelsError)
      return NextResponse.json({ hotels: [] })
    }

    // Get hotels that already have a binding for this provider
    let boundHotelIds: string[] = []
    if (pmsProviderId) {
      const { data: bindings } = await supabase
        .from("hotel_bindings")
        .select("hotel_id")
        .eq("pms_provider_id", pmsProviderId)

      boundHotelIds = (bindings || []).map((b) => b.hotel_id)
    }

    // Filter out already bound hotels
    const availableHotels = (hotels || []).filter((h) => !boundHotelIds.includes(h.id))

    return NextResponse.json({
      hotels: availableHotels,
      total: hotels?.length || 0,
      available: availableHotels.length,
    })
  } catch (error) {
    console.error("Error in available-hotels API:", error)
    return NextResponse.json({ hotels: [] })
  }
}
