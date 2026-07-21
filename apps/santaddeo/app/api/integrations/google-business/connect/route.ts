import { type NextRequest, NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { buildConsentUrl, signState } from "@/lib/google/business-profile"

export const dynamic = "force-dynamic"

/**
 * Avvia il collegamento OAuth di un account Google Business per l'hotel.
 * GET /api/integrations/google-business/connect?hotelId=...
 * Redirige alla pagina di consenso Google. Self-service dall'albergatore.
 */
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) {
    return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  try {
    const origin = request.nextUrl.origin
    const url = buildConsentUrl(signState(hotelId), origin)
    return NextResponse.redirect(url)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Configurazione OAuth mancante" },
      { status: 500 },
    )
  }
}
