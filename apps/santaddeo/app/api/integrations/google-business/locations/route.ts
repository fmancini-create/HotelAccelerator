import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/direct"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import {
  getAccessToken,
  listAccounts,
  listLocations,
  GoogleBusinessQuotaError,
  GoogleBusinessAuthError,
} from "@/lib/google/business-profile"

export const dynamic = "force-dynamic"

interface LocationOption {
  accountId: string // "accounts/123"
  accountName: string
  locationId: string // "locations/456"
  label: string
  address: string | null
}

/**
 * Elenca TUTTE le sedi Google Business accessibili dall'account collegato,
 * attraversando ogni account. Serve a far SCEGLIERE all'utente la sede giusta
 * quando ne ha più di una (l'OAuth concede l'accesso all'intero account, non a
 * una singola scheda: la scelta avviene qui).
 *
 * GET /api/integrations/google-business/locations?hotelId=...
 * → { locations: LocationOption[], selected: string | null }
 */
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from("hotel_integrations")
    .select("google_business_oauth_refresh_token, google_business_location_id")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const refreshToken = data?.google_business_oauth_refresh_token
  if (!refreshToken) {
    return NextResponse.json({ error: "Account Google Business non collegato" }, { status: 400 })
  }

  try {
    const accessToken = await getAccessToken(refreshToken)
    const accounts = await listAccounts(accessToken)
    const locations: LocationOption[] = []
    for (const acct of accounts) {
      const locs = await listLocations(accessToken, acct.name)
      for (const loc of locs) {
        const address =
          [loc.storefrontAddress?.addressLines?.join(", "), loc.storefrontAddress?.locality]
            .filter(Boolean)
            .join(" - ") || null
        locations.push({
          accountId: acct.name,
          accountName: acct.accountName ?? acct.name,
          locationId: loc.name,
          label: loc.title ?? loc.name,
          address,
        })
      }
    }
    return NextResponse.json({
      locations,
      selected: data?.google_business_location_id ?? null,
    })
  } catch (e) {
    if (e instanceof GoogleBusinessQuotaError) {
      // Distinguiamo "API non ABILITATA nel progetto" (config risolvibile
      // subito in Cloud Console) da "quota/permessi non approvati".
      if (e.apiNotEnabled) {
        const svc = e.serviceName ?? "mybusinessaccountmanagement.googleapis.com"
        return NextResponse.json(
          {
            error: "api_disabled",
            message: `L'API "${svc}" non è abilitata nel progetto Google Cloud. Abilitala (e anche "My Business Business Information API") e riprova tra qualche minuto.`,
          },
          { status: 403 },
        )
      }
      return NextResponse.json(
        {
          error: "quota",
          message:
            "Accesso alle Google Business Profile API non ancora approvato da Google (quota a 0): la lista delle sedi sarà disponibile dopo che Google avrà concesso la quota richiesta tramite l'apposito modulo. Nel frattempo puoi comunque generare e copiare le risposte.",
        },
        { status: 403 },
      )
    }
    if (e instanceof GoogleBusinessAuthError) {
      return NextResponse.json(
        { error: "auth", message: "Sessione Google scaduta: ricollega l'account." },
        { status: 401 },
      )
    }
    console.error("[google-business/locations] error:", e)
    // Esponiamo il messaggio reale di Google (es. "Places API has not been
    // used", "PERMISSION_DENIED", ecc.) così la card aiuta a capire la causa
    // invece del generico "Impossibile recuperare le sedi".
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: "fetch_failed", message: `Impossibile recuperare le sedi: ${detail}` },
      { status: 500 },
    )
  }
}

/**
 * Salva la sede scelta dall'utente.
 * POST /api/integrations/google-business/locations?hotelId=...
 * body: { accountId: "accounts/123", locationId: "locations/456" }
 */
export async function POST(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string
    locationId?: string
  }
  if (!body.accountId || !body.locationId) {
    return NextResponse.json({ error: "accountId e locationId richiesti" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()
  const { error } = await supabase
    .from("hotel_integrations")
    .update({
      google_business_account_id: body.accountId,
      google_business_location_id: body.locationId,
      updated_at: new Date().toISOString(),
    })
    .eq("hotel_id", hotelId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
