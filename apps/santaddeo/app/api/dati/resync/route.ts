import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get hotel ID
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single()

    if (!profile) {
      return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 })
    }

    const { data: hotel } = await supabase
      .from("hotels")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .single()

    if (!hotel) {
      return NextResponse.json({ success: false, error: "Hotel not found" }, { status: 404 })
    }

    console.log("[v0] Resync - Starting cleanup for hotel:", hotel.id)

    // Step 1: Delete ALL availability records
    const { error: deleteError } = await supabase.from("daily_availability").delete().eq("hotel_id", hotel.id)

    if (deleteError) {
      console.error("[v0] Resync - Error deleting records:", deleteError)
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 })
    }

    console.log("[v0] Resync - Deleted all availability records")

    // Step 2: Trigger availability sync using the correct API endpoint
    const requestUrl = new URL(request.url)
    const origin = requestUrl.origin
    const syncUrl = `${origin}/api/scidoo/sync-availability`

    console.log("[v0] Resync - Calling sync API at:", syncUrl)

    const headers = new Headers()
    headers.set("Content-Type", "application/json")

    const syncResponse = await fetch(syncUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        hotelId: hotel.id,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      }),
    })

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text()
      console.error("[v0] Resync - Sync failed:", errorText)
      return NextResponse.json(
        {
          success: false,
          error: "Sync failed",
          details: errorText,
        },
        { status: 500 },
      )
    }

    const syncResult = await syncResponse.json()
    console.log("[v0] Resync - Sync completed:", syncResult)

    return NextResponse.json({
      success: true,
      message: "Pulizia e risincronizzazione completate",
      syncResult,
    })
  } catch (error: any) {
    console.error("[v0] Resync - Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
