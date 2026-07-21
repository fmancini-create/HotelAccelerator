import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/direct"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

/**
 * Stato del collegamento Google Business per un hotel.
 * GET /api/integrations/google-business?hotelId=...
 * → { connected, email, hasLocation, connectedAt }
 */
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("hotel_integrations")
    .select(
      "google_business_oauth_refresh_token, google_business_oauth_email, google_business_connected_at, google_business_account_id, google_business_location_id",
    )
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const connected = !!data?.google_business_oauth_refresh_token
  return NextResponse.json({
    connected,
    email: data?.google_business_oauth_email ?? null,
    hasLocation: !!data?.google_business_location_id,
    connectedAt: data?.google_business_connected_at ?? null,
  })
}

/**
 * Scollega l'account Google Business (azzera token e metadati).
 * DELETE /api/integrations/google-business?hotelId=...
 */
export async function DELETE(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createServiceRoleClient()
  const { error } = await supabase
    .from("hotel_integrations")
    .update({
      google_business_oauth_refresh_token: null,
      google_business_oauth_email: null,
      google_business_connected_at: null,
      google_business_account_id: null,
      google_business_location_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("hotel_id", hotelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
