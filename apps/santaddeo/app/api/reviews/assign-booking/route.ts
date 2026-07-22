import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

/**
 * Associazione MANUALE di una recensione a una prenotazione (e tipologia camera).
 * POST { reviewId, bookingId }
 *  - bookingId valorizzato -> associa; la tipologia camera deriva dalla prenotazione
 *  - bookingId null/"" -> rimuove l'associazione (torna "da associare")
 * L'associazione manuale ha sempre la precedenza e setta match_source='manual'.
 * Auth: validateHotelAccess sull'hotel della recensione.
 */
export async function POST(request: NextRequest) {
  let body: { reviewId?: string; bookingId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const reviewId = body.reviewId
  if (!reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 })

  const svc = await createServiceRoleClient()
  const { data: review, error: re } = await svc
    .from("hotel_reviews")
    .select("id, hotel_id")
    .eq("id", reviewId)
    .maybeSingle()
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })
  if (!review) return NextResponse.json({ error: "review not found" }, { status: 404 })

  const denied = await validateHotelAccess(review.hotel_id)
  if (denied) return denied

  // Rimozione associazione
  if (!body.bookingId) {
    const { error } = await svc
      .from("hotel_reviews")
      .update({ booking_id: null, room_type_id: null, match_source: null, match_confidence: null, matched_at: null })
      .eq("id", reviewId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, booking: null, roomType: null })
  }

  // Verifica che la prenotazione sia dello stesso hotel e recupera la tipologia.
  const { data: booking, error: be } = await svc
    .from("bookings")
    .select("id, hotel_id, room_type_id, guest_name, check_in_date, check_out_date")
    .eq("id", body.bookingId)
    .maybeSingle()
  if (be) return NextResponse.json({ error: be.message }, { status: 500 })
  if (!booking || booking.hotel_id !== review.hotel_id) {
    return NextResponse.json({ error: "booking not found for this hotel" }, { status: 400 })
  }

  let roomTypeName: string | null = null
  if (booking.room_type_id) {
    const { data: rt } = await svc.from("room_types").select("name").eq("id", booking.room_type_id).maybeSingle()
    roomTypeName = rt?.name ?? null
  }

  const { error } = await svc
    .from("hotel_reviews")
    .update({
      booking_id: booking.id,
      room_type_id: booking.room_type_id,
      match_source: "manual",
      match_confidence: 1,
      matched_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    booking: {
      id: booking.id,
      guestName: booking.guest_name,
      checkInDate: booking.check_in_date,
      checkOutDate: booking.check_out_date,
    },
    roomType: booking.room_type_id ? { id: booking.room_type_id, name: roomTypeName } : null,
  })
}
