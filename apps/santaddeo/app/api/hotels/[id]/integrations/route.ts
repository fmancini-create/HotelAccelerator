import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: hotelId } = await params
    // createClient() is async in this project (Next 15/16 server client).
    // Without the await, `supabase` is a Promise and `.from is not a function`.
    const supabase = await createClient()

    // Fetch integration config from hotel_integrations table
    const { data, error } = await supabase.from("hotel_integrations").select("*").eq("hotel_id", hotelId).single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine for first time
      throw error
    }

    return NextResponse.json({ data: data || {} })
  } catch (error) {
    console.error("[v0] Error fetching integrations:", error)
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: hotelId } = await params
    const body = await request.json()

    const supabase = await createClient()

    // Upsert integration config in `hotel_integrations`, the canonical table.
    // We only write keys that were provided in the body, so unrelated fields
    // (e.g. Apify token while saving weather-only) survive a partial save.
    //
    // NOTE: `google_maps_*` fields are written exclusively by the dedicated
    // /api/integrations/reviews/connect-hotel route. We skip them here to
    // avoid overwriting a successful match with an empty form value.
    const patch: Record<string, unknown> = {
      hotel_id: hotelId,
      updated_at: new Date().toISOString(),
    }

    // Weather is handled separately by lib/services/weather-service.ts using
    // Open-Meteo (no API key needed), so we do not expose weather fields here.
    const allowed = [
      "google_analytics_id",
      "google_analytics_api_key",
      "google_analytics_property_id",
      "google_places_api_key",
      "booking_com_username",
      "booking_com_password",
      "booking_com_property_id",
      "apify_api_token",
      // Multi-platform review URLs
      "booking_com_url",
      "tripadvisor_url",
      "expedia_url",
      "vrbo_url",
      "airbnb_url",
    ] as const

    for (const key of allowed) {
      if (key in body) patch[key] = body[key] ?? null
    }

    const { error } = await supabase
      .from("hotel_integrations")
      .upsert(patch, { onConflict: "hotel_id" })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error updating integrations:", error)
    return NextResponse.json({ error: "Failed to update integrations" }, { status: 500 })
  }
}
