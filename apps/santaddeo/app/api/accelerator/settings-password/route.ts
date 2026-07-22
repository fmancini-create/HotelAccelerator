import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const SENTINEL_DATE = "9999-12-31"
const PARAM_KEY = "ref_password_hash"

/**
 * GET: retrieve the password hash for a hotel (date-independent).
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Try sentinel date first (new format)
    const { data: sentinel } = await supabase
      .from("pricing_algo_params")
      .select("param_value")
      .eq("hotel_id", hotelId)
      .eq("param_key", PARAM_KEY)
      .eq("date", SENTINEL_DATE)
      .maybeSingle()

    if (sentinel?.param_value) {
      return NextResponse.json({ hash: sentinel.param_value })
    }

    // Fallback: search any date that has the hash (legacy per-day storage)
    const { data: legacy } = await supabase
      .from("pricing_algo_params")
      .select("param_value")
      .eq("hotel_id", hotelId)
      .eq("param_key", PARAM_KEY)
      .limit(1)

    if (legacy && legacy.length > 0 && legacy[0].param_value) {
      return NextResponse.json({ hash: legacy[0].param_value })
    }

    return NextResponse.json({ hash: null })
  } catch (error) {
    console.error("Settings password GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    )
  }
}

/**
 * POST: save or remove the password hash for a hotel (date-independent).
 * Body: { hotel_id, hash } — pass hash="" or null to remove protection.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, hash } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    if (!hash) {
      // Remove password: delete all rows with this param_key for this hotel
      await supabase
        .from("pricing_algo_params")
        .delete()
        .eq("hotel_id", hotel_id)
        .eq("param_key", PARAM_KEY)

      return NextResponse.json({ success: true, removed: true })
    }

    // Upsert sentinel row
    const { error } = await supabase
      .from("pricing_algo_params")
      .upsert(
        {
          hotel_id,
          param_key: PARAM_KEY,
          date: SENTINEL_DATE,
          param_value: hash,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "hotel_id,param_key,date" }
      )

    if (error) {
      console.error("Error saving password hash:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Clean up legacy per-day rows (except sentinel)
    await supabase
      .from("pricing_algo_params")
      .delete()
      .eq("hotel_id", hotel_id)
      .eq("param_key", PARAM_KEY)
      .neq("date", SENTINEL_DATE)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Settings password POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    )
  }
}
