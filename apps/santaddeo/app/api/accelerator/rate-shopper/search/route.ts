import { NextRequest, NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * Ricerca strutture su Google Hotels (via SerpApi) per ottenere il
 * `property_token` da salvare come competitor.external_ref.
 * google_hotels richiede check_in/check_out: usiamo una data di riferimento
 * vicina solo per popolare la ricerca (non viene salvata).
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const hotelId = sp.get("hotelId")
  const q = sp.get("q")?.trim()
  if (!hotelId || !q) {
    return NextResponse.json({ error: "hotelId e q richiesti" }, { status: 400 })
  }

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "rate_shopper"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "SerpApi non configurato (SERPAPI_KEY mancante)" }, { status: 503 })
  }

  // date di riferimento per la ricerca: tra 30 e 31 giorni da oggi (1 notte)
  const ci = new Date()
  ci.setUTCDate(ci.getUTCDate() + 30)
  const co = new Date(ci)
  co.setUTCDate(co.getUTCDate() + 1)
  const checkIn = ci.toISOString().slice(0, 10)
  const checkOut = co.toISOString().slice(0, 10)
  const currency = process.env.RATE_SHOPPER_CURRENCY || "EUR"

  const url =
    `https://serpapi.com/search.json?engine=google_hotels` +
    `&q=${encodeURIComponent(q)}` +
    `&check_in_date=${checkIn}&check_out_date=${checkOut}` +
    `&adults=2&currency=${encodeURIComponent(currency)}&gl=it&hl=it` +
    `&api_key=${encodeURIComponent(apiKey)}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) })
    const data = await res.json()
    if (data?.error) {
      return NextResponse.json({ error: `SerpApi: ${data.error}` }, { status: 502 })
    }

    const mapProp = (p: Record<string, any>) => ({
      token: p.property_token as string,
      name: p.name as string,
      type: p.type ?? null,
      hotelClass: p.hotel_class ?? null,
      rate: p?.rate_per_night?.extracted_lowest ?? null,
      gpsCoordinates: p.gps_coordinates ?? null,
    })

    // Google Hotels restituisce un array `properties` per ricerche generiche, ma
    // quando la query individua UNA sola struttura risponde con i dati della
    // proprietà direttamente alla radice (con property_token a top-level).
    let candidates: Record<string, any>[] = []
    if (Array.isArray(data?.properties) && data.properties.length > 0) {
      candidates = data.properties
    } else if (data?.property_token && data?.name) {
      candidates = [data]
    }

    const results = candidates
      .filter((p: Record<string, any>) => p?.property_token && p?.name)
      .slice(0, 15)
      .map(mapProp)

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[rate-shopper:search] errore", err)
    return NextResponse.json({ error: "Errore durante la ricerca" }, { status: 500 })
  }
}
