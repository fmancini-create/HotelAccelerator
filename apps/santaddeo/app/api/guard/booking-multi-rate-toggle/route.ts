import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

/**
 * Toggle manuale del flag `bookings.is_multi_rate`.
 *
 * Caso d'uso (richiesta utente 01/05/2026 incident Barronci #4867):
 * il Guard auto-rileva le prenotazioni multi-tariffa quando booked_price
 * e' > expected * 1.20 su uno stay >= 2 notti. La euristica e' indiretta
 * (Scidoo non espone i prezzi per-notte) e puo' sbagliare. Questo
 * endpoint permette all'operatore in /dati/guard di disattivare il flag
 * (false-positive) o riattivarlo (false-negative).
 *
 * Body:
 *   - booking_id: string (uuid o pms_booking_id)
 *   - hotel_id: string (per scope verification)
 *   - value: boolean (target state, true=multi-rate, false=normale)
 *
 * Response: { success, before, after } | { error }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const body = await request.json()
    const booking_id: unknown = body?.booking_id
    const hotel_id: unknown = body?.hotel_id
    const value: unknown = body?.value

    if (typeof booking_id !== "string" || !booking_id.trim()) {
      return NextResponse.json({ error: "booking_id obbligatorio" }, { status: 400 })
    }
    if (typeof hotel_id !== "string" || !hotel_id.trim()) {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }
    if (typeof value !== "boolean") {
      return NextResponse.json(
        { error: "value boolean obbligatorio" },
        { status: 400 },
      )
    }

    // FIX 02/05/2026 (stesso bug di night-rate-override): il check
    // precedente usava `profiles.hotel_id` che non esiste -> 403 anche
    // per super_admin. Sostituito con `validateHotelAccess()` (gestisce
    // super_admin, hotel_users e organization_id legacy).
    const denied = await validateHotelAccess(hotel_id)
    if (denied) return denied

    // Lookup del booking per id (uuid) o pms_booking_id.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        booking_id,
      )
    const lookup = isUuid
      ? supabase
          .from("bookings")
          .select("id, is_multi_rate, hotel_id")
          .eq("id", booking_id)
          .eq("hotel_id", hotel_id)
          .maybeSingle()
      : supabase
          .from("bookings")
          .select("id, is_multi_rate, hotel_id")
          .eq("pms_booking_id", booking_id)
          .eq("hotel_id", hotel_id)
          .maybeSingle()

    const { data: bookingRow, error: bookingErr } = await lookup
    if (bookingErr) {
      return NextResponse.json(
        { error: `Errore lookup: ${bookingErr.message}` },
        { status: 500 },
      )
    }
    if (!bookingRow) {
      return NextResponse.json(
        { error: "Prenotazione non trovata o non appartiene a questo hotel" },
        { status: 404 },
      )
    }

    const before = !!bookingRow.is_multi_rate
    if (before === value) {
      return NextResponse.json({ success: true, before, after: value, changed: false })
    }

    const { error: updErr } = await supabase
      .from("bookings")
      .update({ is_multi_rate: value })
      .eq("id", bookingRow.id)
    if (updErr) {
      return NextResponse.json(
        { error: `Errore update: ${updErr.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, before, after: value, changed: true })
  } catch (err) {
    console.error("[guard/booking-multi-rate-toggle] error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    )
  }
}
