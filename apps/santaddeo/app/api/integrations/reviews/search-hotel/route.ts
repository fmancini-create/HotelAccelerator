import { createClient } from "@/lib/supabase/server"
import { GooglePlacesService } from "@/lib/services/google-places-service"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { hotelId, hotelName, address, googleApiKey } = body

    if (!hotelName) {
      return NextResponse.json({ error: "Hotel name is required" }, { status: 400 })
    }

    if (!googleApiKey) {
      return NextResponse.json({ error: "Google API key is required" }, { status: 400 })
    }

    if (googleApiKey.length < 30) {
      return NextResponse.json(
        {
          error:
            "La chiave API sembra non valida. Verifica di aver copiato correttamente la chiave da Google Cloud Console.",
        },
        { status: 400 },
      )
    }

    console.log("[v0] Searching hotel with Google Places API")

    // Search for the hotel on Google Places
    const placesService = new GooglePlacesService(googleApiKey)
    const results = await placesService.searchHotel(hotelName, address)

    console.log("[v0] Search completed, found", results.length, "results")

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    })
  } catch (error: any) {
    console.error("[v0] Error searching hotel:", error)
    return NextResponse.json(
      {
        error: error.message || "Failed to search hotel",
        details: "Verifica che la Google Places API sia abilitata e configurata correttamente.",
      },
      { status: 500 },
    )
  }
}
