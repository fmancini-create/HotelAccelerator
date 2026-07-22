import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET reminder config for (current user, hotel, platform).
 * Returns `null` if the user has never configured it.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")
  const platform = searchParams.get("platform") || "booking_com"
  if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("ota_reminder_settings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminder: data })
}

/**
 * Upsert reminder config. The user who sends this becomes the
 * recipient of email + popup notifications, mirroring the pattern used
 * for price-change alerts.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const {
    hotelId,
    platform = "booking_com",
    frequencyDays = 30,
    emailEnabled = true,
    popupEnabled = true,
    isActive = true,
  } = body ?? {}

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }
  const freq = Math.min(180, Math.max(7, Number(frequencyDays) || 30))
  const nextRunAt = new Date(Date.now() + freq * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("ota_reminder_settings")
    .upsert(
      {
        hotel_id: hotelId,
        user_id: user.id,
        platform,
        frequency_days: freq,
        email_enabled: emailEnabled,
        popup_enabled: popupEnabled,
        is_active: isActive,
        next_run_at: nextRunAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id,user_id,platform" },
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reminder: data })
}
