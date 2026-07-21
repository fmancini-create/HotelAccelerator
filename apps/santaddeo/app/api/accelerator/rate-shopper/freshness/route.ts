import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import { getProvider } from "@/lib/rate-shopper/registry"
import { computeFreshness } from "@/lib/rate-shopper/freshness"

export const dynamic = "force-dynamic"

/**
 * Freschezza dei prezzi competitor per una struttura.
 *
 * Strategia: il cron gira una volta a settimana (baseline). In piu', quando un
 * utente apre il Rate Shopper e i prezzi di ALMENO UN competitor non sono
 * ancora aggiornati oggi (o non coprono l'orizzonte), la pagina lancia un
 * refresh "pigro" una sola volta. La freschezza e' calcolata PER COMPETITOR
 * (vedi lib/rate-shopper/freshness): cosi' aggiungere un nuovo competitor forza
 * il refresh anche se gli altri sono gia' aggiornati.
 *
 * `stale` e' true solo se esiste una fonte auto-aggiornabile (provider Google
 * configurato + almeno un competitor con property_token): per i comp set solo
 * manuali non ha senso mostrare il banner di download.
 */
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotelId")
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "rate_shopper"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  // Senza provider Google configurato non c'e' nulla da auto-aggiornare.
  if (!getProvider("serpapi").isConfigured()) {
    return NextResponse.json({ autoRefreshable: false, stale: false, coverageDays: 0, competitors: [] })
  }

  const supabase = await createServiceRoleClient()
  const f = await computeFreshness(supabase, hotelId)

  return NextResponse.json({
    autoRefreshable: f.autoRefreshable,
    stale: f.stale,
    coverageDays: f.coverageDays,
    pulledToday: f.pulledToday,
    staleCompetitorIds: f.staleCompetitorIds,
    competitors: f.competitors,
  })
}
