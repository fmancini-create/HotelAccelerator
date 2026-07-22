import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// Security: uses cookie-based auth client (respects RLS)
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  const organizationId = searchParams.get("organizationId")

  let query = supabase.from("accelerator_subscriptions").select("*").eq("is_active", true)

  if (hotelId) {
    query = query.eq("hotel_id", hotelId)
  }

  if (organizationId) {
    // Get hotels for org, then filter subscriptions
    const { data: hotels } = await supabase.from("hotels").select("id").eq("organization_id", organizationId)
    if (hotels && hotels.length > 0) {
      query = query.in(
        "hotel_id",
        hotels.map((h) => h.id),
      )
    }
  }

  const { data: subscriptions, error } = await query.order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch hotels for subscriptions
  const hotelIds = [...new Set(subscriptions?.map((s) => s.hotel_id).filter(Boolean))]
  let hotels: any[] = []
  if (hotelIds.length > 0) {
    const { data: hotelsData } = await supabase.from("hotels").select("*").in("id", hotelIds)
    hotels = hotelsData || []
  }

  const subscriptionsWithHotels =
    subscriptions?.map((sub) => ({
      ...sub,
      hotel: hotels.find((h) => h.id === sub.hotel_id) || null,
    })) || []

  return NextResponse.json({ subscriptions: subscriptionsWithHotels })
}
