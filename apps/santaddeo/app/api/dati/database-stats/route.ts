import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Database stats - Starting")

    const supabase = await createClient()

    // Get hotel ID from user session
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single()

    if (!profile) {
      return NextResponse.json({ error: "Profilo non trovato" }, { status: 404 })
    }

    const { data: hotel } = await supabase
      .from("hotels")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .single()

    if (!hotel) {
      return NextResponse.json({ error: "Hotel non trovato" }, { status: 404 })
    }

    const hotelId = hotel.id
    console.log("[v0] Database stats - Hotel ID:", hotelId)

    // Count raw availability records
    const { count: rawCount } = await supabase
      .from("scidoo_raw_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)

    console.log("[v0] Database stats - Raw availability count:", rawCount)

    // Count daily availability records
    const { count: dailyCount } = await supabase
      .from("daily_availability")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)

    console.log("[v0] Database stats - Daily availability count:", dailyCount)

    // Get room type mappings
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, scidoo_room_type_id, is_active")
      .eq("hotel_id", hotelId)
      .order("name")

    console.log("[v0] Database stats - Room types:", roomTypes?.length)

    // Get sample raw data
    const { data: rawSamples } = await supabase
      .from("scidoo_raw_availability")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(10)

    console.log("[v0] Database stats - Raw samples:", rawSamples?.length)

    // Get sample daily data
    const { data: dailySamples } = await supabase
      .from("daily_availability")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("date", { ascending: false })
      .limit(10)

    console.log("[v0] Database stats - Daily samples:", dailySamples?.length)

    return NextResponse.json({
      rawAvailabilityCount: rawCount || 0,
      dailyAvailabilityCount: dailyCount || 0,
      roomTypeMappings: roomTypes || [],
      rawSamples: rawSamples || [],
      dailySamples: dailySamples || [],
    })
  } catch (error: any) {
    console.error("[v0] Database stats - Error:", error)
    return NextResponse.json({ error: error.message || "Errore nel caricamento dei dati" }, { status: 500 })
  }
}
