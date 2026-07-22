import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import { logSupabaseError } from "@/lib/supabase/error-utils"
import { getProvider } from "@/lib/rate-shopper/registry"
import { isSerpApiInCooldown } from "@/lib/rate-shopper/providers/serpapi"
import { computeFreshness } from "@/lib/rate-shopper/freshness"
import { recordProviderOutcome } from "@/lib/rate-shopper/provider-state"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Pull on-demand dei prezzi competitor per UNA struttura, su un orizzonte
 * breve (default 14 giorni) per restare nei tempi di risposta. Usa lo stesso
 * provider del cron (SerpApi/Google Hotels) ma triggerato dall'utente per un
 * feedback immediato dopo aver aggiunto un competitor.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const hotelId = body?.hotelId as string | undefined
  if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })

  const denied = await validateHotelAccess(hotelId)
  if (denied) return denied
  if (!(await hasAddon(hotelId, "rate_shopper"))) {
    return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
  }

  const days = Math.min(Math.max(Number(body?.days || 14), 1), 60)
  const occupancy = Number(body?.occupancy || 2)
  // ifStale: usato dal refresh "pigro" all'apertura pagina. Se i prezzi sono
  // gia' stati scaricati oggi, salta il pull (evita doppioni da tab concorrenti).
  const ifStale = body?.ifStale === true
  const provider = getProvider("serpapi")
  if (!provider.isConfigured()) {
    await recordProviderOutcome("serpapi", "not_configured", "SERPAPI_KEY mancante")
    return NextResponse.json(
      { error: "Google Hotels non configurato (SERPAPI_KEY mancante)", code: "PROVIDER_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  const supabase = await createServiceRoleClient()

  // ifStale: pulliamo SOLO i competitor che ne hanno bisogno (mancante o
  // copertura insufficiente). Cosi' aggiungere un nuovo competitor scarica solo
  // quello, senza ri-pagare le chiamate SerpApi per quelli gia' aggiornati.
  let onlyCompetitorIds: string[] | null = null
  if (ifStale) {
    const f = await computeFreshness(supabase, hotelId)
    if (f.staleCompetitorIds.length === 0) {
      return NextResponse.json({ ok: true, pulled: 0, skipped: true, note: "Prezzi gia' aggiornati oggi" })
    }
    onlyCompetitorIds = f.staleCompetitorIds
  }

  // competitor serpapi attivi con property_token
  const { data: comps, error } = await supabase
    .from("competitors")
    .select("id, name, external_ref")
    .eq("hotel_id", hotelId)
    .eq("provider", "serpapi")
    .eq("active", true)
  if (error) {
    logSupabaseError("rate-shopper-refresh: competitors", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  let withToken = (comps ?? []).filter((c) => c.external_ref)
  if (onlyCompetitorIds) {
    const stale = new Set(onlyCompetitorIds)
    withToken = withToken.filter((c) => stale.has(c.id))
  }
  if (withToken.length === 0) {
    return NextResponse.json({ ok: true, pulled: 0, note: "Nessun competitor Google Hotels da aggiornare" })
  }

  const today = new Date()
  const from = today.toISOString().slice(0, 10)
  const end = new Date(today)
  end.setDate(end.getDate() + days)
  const to = end.toISOString().slice(0, 10)

  try {
    const rates = await provider.fetchRates({
      hotelId,
      from,
      to,
      occupancy,
      competitors: withToken.map((c) => ({ id: c.id, externalRef: c.external_ref, name: c.name })),
    })
    if (rates.length === 0) {
      // Distinguiamo "quota esaurita" da "nessun prezzo": l'utente capisce
      // perche' non vede aggiornamenti e che e' temporaneo.
      if (isSerpApiInCooldown()) {
        await recordProviderOutcome("serpapi", "quota_exceeded", "Quota Google Hotels esaurita")
        return NextResponse.json({
          ok: true,
          pulled: 0,
          code: "QUOTA_EXCEEDED",
          note: "Quota giornaliera Google Hotels esaurita: riprova piu' tardi",
        })
      }
      await recordProviderOutcome("serpapi", "no_data", "Nessun prezzo restituito")
      return NextResponse.json({ ok: true, pulled: 0, note: "Nessun prezzo restituito" })
    }

    const capturedAt = new Date().toISOString()
    const rows = rates.map((r) => ({
      hotel_id: hotelId,
      competitor_id: r.competitorRef,
      stay_date: r.stayDate,
      captured_at: capturedAt,
      los: r.los,
      occupancy: r.occupancy,
      price: r.price,
      currency: r.currency,
      availability: r.availability,
      channel: r.channel ?? null,
      provider: "serpapi",
      raw_data: r.raw ?? null,
    }))

    const { error: upErr } = await supabase
      .from("competitor_rates")
      .upsert(rows, { onConflict: "competitor_id,stay_date,los,occupancy,captured_at" })
    if (upErr) {
      logSupabaseError("rate-shopper-refresh: upsert", upErr)
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    const withPrice = rows.filter((r) => r.price != null).length
    await recordProviderOutcome("serpapi", "ok")
    return NextResponse.json({ ok: true, pulled: rows.length, withPrice, from, to })
  } catch (err) {
    console.error("[rate-shopper:refresh] errore", err)
    await recordProviderOutcome("serpapi", "error", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: "Errore durante l'aggiornamento prezzi" }, { status: 500 })
  }
}
