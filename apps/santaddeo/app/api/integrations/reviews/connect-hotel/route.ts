import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { NextResponse } from "next/server"

/**
 * Connects an hotel to its Google Maps place. Writes exclusively to
 * `hotel_integrations` — the canonical source. The legacy columns on
 * `hotels` are no longer touched by this route; the Advanced Settings
 * form now reads and writes hotel_integrations only.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { hotelId, placeId, placeName, placeAddress } = body

    if (!hotelId || !placeId) {
      return NextResponse.json({ error: "Hotel ID and Place ID are required" }, { status: 400 })
    }

    // Authorization tramite l'helper canonico: copre super_admin, il nuovo
    // sistema `hotel_users` e il vecchio match per `organization_id`. Il
    // controllo custom precedente su `user_roles` NON riconosceva il
    // super_admin (operando su una struttura di un'altra org) -> 403 sul
    // tasto Collega anche se la ricerca funzionava. (FIX 03/06/2026)
    const denied = await validateHotelAccess(hotelId, user)
    if (denied) return denied

    // Upsert in hotel_integrations. ON CONFLICT only updates the Maps-related
    // columns so any previously saved keys (Apify, weather, etc.) survive.
    const { error: updateError } = await supabase
      .from("hotel_integrations")
      .upsert(
        {
          hotel_id: hotelId,
          google_maps_place_id: placeId,
          google_maps_place_name: placeName ?? null,
          google_maps_place_address: placeAddress ?? null,
          google_maps_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "hotel_id" },
      )

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      message: "Hotel connected successfully",
      placeId,
      placeName,
    })
  } catch (error: any) {
    console.error("[v0] Error connecting hotel:", error)
    return NextResponse.json({ error: error.message || "Failed to connect hotel" }, { status: 500 })
  }
}

/**
 * Disconnects the hotel from its Google Maps place. Clears only the
 * Maps-related columns in hotel_integrations — other integrations
 * (Apify, weather, etc.) are left untouched.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { hotelId } = body
    if (!hotelId) {
      return NextResponse.json({ error: "Hotel ID is required" }, { status: 400 })
    }

    // Stessa authorization canonica della POST (super_admin incluso).
    const denied = await validateHotelAccess(hotelId, user)
    if (denied) return denied

    const { error: updateError } = await supabase
      .from("hotel_integrations")
      .update({
        google_maps_place_id: null,
        google_maps_place_name: null,
        google_maps_place_address: null,
        google_maps_url: null,
        google_maps_connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("hotel_id", hotelId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Error disconnecting hotel:", error)
    return NextResponse.json(
      { error: error.message || "Failed to disconnect hotel" },
      { status: 500 },
    )
  }
}
