import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/direct"
import {
  exchangeCodeForTokens,
  getAccessToken,
  getConnectedEmail,
  listAccounts,
  listLocations,
  verifyState,
  GoogleBusinessQuotaError,
} from "@/lib/google/business-profile"

export const dynamic = "force-dynamic"

/**
 * Callback OAuth Google Business. Scambia il code per il refresh_token,
 * recupera email + (best-effort) account/location, salva in hotel_integrations.
 *
 * NB: se l'API My Business non è ancora approvata (quota 0), accounts/locations
 * falliscono con 403 → salviamo comunque il token (il collegamento è valido) e
 * lasciamo account/location vuoti, da risolvere in fase di pubblicazione.
 */
function redirectToSettings(origin: string, status: string): NextResponse {
  return NextResponse.redirect(`${origin}/settings/advanced?google_business=${status}`)
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const errorParam = request.nextUrl.searchParams.get("error")

  if (errorParam) return redirectToSettings(origin, "denied")
  if (!code || !state) return redirectToSettings(origin, "invalid")

  const hotelId = verifyState(state)
  if (!hotelId) return redirectToSettings(origin, "invalid")

  try {
    const { refreshToken } = await exchangeCodeForTokens(code, origin)
    if (!refreshToken) {
      // Senza refresh_token non possiamo agire offline: forziamo un nuovo
      // consenso (prompt=consent è già impostato, ma alcuni account riusano la
      // grant precedente). Segnaliamo all'utente.
      return redirectToSettings(origin, "no_refresh_token")
    }

    // Email collegata + best-effort account/location.
    let email: string | null = null
    let accountId: string | null = null
    let locationId: string | null = null
    try {
      const accessToken = await getAccessToken(refreshToken)
      email = await getConnectedEmail(accessToken)
      const accounts = await listAccounts(accessToken)
      // Auto-abbiniamo la sede SOLO se è univoca (1 account + 1 location).
      // Se l'utente ha più sedi NON scegliamo noi: lasciamo location vuota e la
      // scelta avviene nel selettore in Impostazioni, per non collegare la
      // scheda sbagliata.
      if (accounts.length === 1) {
        const onlyAccount = accounts[0].name
        const locations = await listLocations(accessToken, onlyAccount)
        if (locations.length === 1) {
          accountId = onlyAccount
          locationId = locations[0].name
        }
      }
    } catch (e) {
      // Quota non approvata o lista non disponibile: il token resta valido,
      // account/location verranno risolti in fase di pubblicazione.
      if (!(e instanceof GoogleBusinessQuotaError)) {
        console.error("[google-business/callback] account lookup error:", e)
      }
    }

    const supabase = await createServiceRoleClient()
    const { error } = await supabase.from("hotel_integrations").upsert(
      {
        hotel_id: hotelId,
        google_business_oauth_refresh_token: refreshToken,
        google_business_oauth_email: email,
        google_business_connected_at: new Date().toISOString(),
        google_business_account_id: accountId,
        google_business_location_id: locationId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id" },
    )
    if (error) {
      console.error("[google-business/callback] save error:", error)
      return redirectToSettings(origin, "save_error")
    }

    return redirectToSettings(origin, "connected")
  } catch (err) {
    console.error("[google-business/callback] error:", err)
    return redirectToSettings(origin, "error")
  }
}
