import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

/**
 * GET /api/integrations/reviews/dormant-channels?hotelId=...
 *
 * Restituisce i canali OTA del tenant che sono attualmente dormienti
 * (3+ sync consecutive senza nuove recensioni). Usato dal banner soft
 * nella pagina /dati/reviews per invitare il tenant a verificare l'URL
 * configurato senza esporre dettagli infrastrutturali.
 *
 * Non espone mai messaggi di errore tecnici, URL configurati, o riferimenti
 * al fornitore di scraping.
 */
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId is required" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const admin = await createServiceRoleClient()
  const { data, error } = await admin
    .from("review_platform_schedules")
    .select("platform, dormant_since, dormant_reason, last_review_found_at, last_sync_at")
    .eq("hotel_id", hotelId)
    .eq("is_dormant", true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    dormant: (data ?? []).map((d) => ({
      platform: d.platform,
      dormant_since: d.dormant_since,
      last_review_found_at: d.last_review_found_at,
      last_sync_at: d.last_sync_at,
      // dormant_reason non viene esposto al tenant: 'no_new_reviews' /
      // 'manual_disable' sono dettagli interni. Il banner mostra solo un
      // messaggio neutro che invita a verificare l'URL.
    })),
  })
}
