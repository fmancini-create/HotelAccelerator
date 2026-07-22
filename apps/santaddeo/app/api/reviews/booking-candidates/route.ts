import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { searchBookingCandidates } from "@/lib/reviews/booking-match"

export const dynamic = "force-dynamic"

/**
 * Candidati prenotazione per associare una recensione (popola il dropdown).
 * GET ?reviewId=...&search=...
 *  - senza search: usa la finestra di soggiorno della recensione (stay_date)
 *  - con search: cerca per nome ospite a prescindere dalle date
 * Auth: validateHotelAccess sull'hotel della recensione.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const reviewId = url.searchParams.get("reviewId")
  const search = url.searchParams.get("search")
  if (!reviewId) return NextResponse.json({ error: "reviewId required" }, { status: 400 })

  const svc = await createServiceRoleClient()
  const { data: review, error } = await svc
    .from("hotel_reviews")
    .select("id, hotel_id, author_name, stay_date")
    .eq("id", reviewId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!review) return NextResponse.json({ error: "review not found" }, { status: 404 })

  const denied = await validateHotelAccess(review.hotel_id)
  if (denied) return denied

  const candidates = await searchBookingCandidates(review.hotel_id, {
    stayDate: review.stay_date,
    authorName: review.author_name,
    search,
  })

  return NextResponse.json({
    reviewStayDate: review.stay_date,
    reviewAuthor: review.author_name,
    candidates,
  })
}
