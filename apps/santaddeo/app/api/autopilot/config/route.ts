import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/autopilot/config?hotelId=xxx
 * Returns the autopilot configuration for a hotel
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("autopilot_configs")
    .select("*")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return default config if none exists
  if (!data) {
    return NextResponse.json({
      hotel_id: hotelId,
      mode: "disabled",
      notify_emails: [],
      last_notification_at: null,
      last_push_at: null,
      last_full_sync_at: null,
    })
  }

  return NextResponse.json(data)
}

/**
 * POST/PUT /api/autopilot/config
 * Update or create autopilot configuration.
 *
 * Body: {
 *   hotelId: string,
 *   mode?: "disabled" | "notify" | "autopilot",
 *   notify_emails?: string[],
 *   mark_first_sync_completed?: boolean  // set last_full_sync_at = NOW()
 * }
 *
 * When `mark_first_sync_completed` is true we additionally stamp
 * `last_full_sync_at = now()` so the UI knows the initial 400-day push already
 * happened and subsequent re-activations of Autopilot skip the first-sync
 * dialog.
 */
async function handleUpsert(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  const { hotelId, mode, notify_emails, mark_first_sync_completed } = body

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  if (mode && !["disabled", "notify", "autopilot"].includes(mode)) {
    return NextResponse.json({ error: "mode must be disabled, notify, or autopilot" }, { status: 400 })
  }

  // Validate emails
  //
  // FIX 01/05/2026 (incident Massabo' "email non arrivano"): la regex
  // precedente `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accettava virgole nel local
  // part. L'utente aveva salvato "f,mancini@4bid.it" (typo virgola al
  // posto del punto) e quel record passava il check senza errori, ma
  // ovviamente nessun MX accettava la consegna. Stringo a un set di
  // caratteri RFC 5322-friendly: lettere, cifre e i pochi simboli leciti
  // nel local part (`._%+-`). Niente virgole, niente spazi.
  if (notify_emails && Array.isArray(notify_emails)) {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    for (const email of notify_emails) {
      if (typeof email !== "string" || !emailRegex.test(email.trim())) {
        return NextResponse.json({ error: `Email non valida: ${email}` }, { status: 400 })
      }
    }
  }

  const upsertPayload: Record<string, any> = {
    hotel_id: hotelId,
    mode: mode || "disabled",
    notify_emails: notify_emails || [],
    updated_at: new Date().toISOString(),
  }
  if (mark_first_sync_completed) {
    upsertPayload.last_full_sync_at = new Date().toISOString()
    upsertPayload.last_push_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("autopilot_configs")
    .upsert(upsertPayload, { onConflict: "hotel_id" })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export const POST = handleUpsert
export const PUT = handleUpsert
