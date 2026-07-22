import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { logSupabaseError } from "@/lib/supabase/error-utils"
import { requireCronAuth } from "@/lib/cron-auth"
import { getPullableProviders } from "@/lib/rate-shopper/registry"
import { isSerpApiInCooldown } from "@/lib/rate-shopper/providers/serpapi"
import { recordProviderOutcome } from "@/lib/rate-shopper/provider-state"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Cron SETTIMANALE (lunedi 05:00 UTC, vedi vercel.json): baseline garantito.
// Per ogni provider esterno CONFIGURATO recupera i prezzi del comp set di ogni
// struttura e li salva in competitor_rates. Nei giorni infrasettimanali il
// refresh avviene "pigramente" al primo accesso alla pagina (vedi
// /api/accelerator/rate-shopper/freshness + refresh con ifStale). Se nessun
// provider esterno e' configurato (solo 'manual'), il cron e' un no-op.
const HORIZON_DAYS = 60

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireCronAuth(request)
    if (unauthorized) return unauthorized
    if (request.nextUrl.searchParams.get("warm") === "1") {
      return NextResponse.json({ ok: true, warm: true })
    }

    const providers = getPullableProviders()
    if (providers.length === 0) {
      return NextResponse.json({ ok: true, note: "Nessun provider esterno configurato (solo manual)", pulled: 0 })
    }

    const supabase = await createServiceRoleClient()
    const today = new Date()
    const from = today.toISOString().slice(0, 10)
    const end = new Date(today)
    end.setDate(end.getDate() + HORIZON_DAYS)
    const to = end.toISOString().slice(0, 10)

    let pulled = 0
    const results: Record<string, number> = {}

    for (const provider of providers) {
      // Esito per-provider: serve a mostrare in UI la VERA causa di un compset
      // fermo (quota esaurita vs nessun dato) invece del generico "da configurare".
      let providerPulled = 0
      let quotaHit = false

      // competitor di questo provider, raggruppati per hotel
      const { data: comps, error } = await supabase
        .from("competitors")
        .select("id, hotel_id, name, external_ref")
        .eq("provider", provider.key)
        .eq("active", true)
      if (error) {
        logSupabaseError(`rate-shopper-pull: competitors ${provider.key}`, error)
        continue
      }
      const byHotel = new Map<string, typeof comps>()
      for (const c of comps ?? []) {
        const arr = byHotel.get(c.hotel_id) ?? []
        arr.push(c)
        byHotel.set(c.hotel_id, arr)
      }

      for (const [hotelId, hotelComps] of byHotel) {
        // Se il provider ha gia' segnalato quota esaurita, inutile procedere
        // con gli altri hotel: il circuit breaker tornerebbe [] per ciascuno.
        if (provider.key === "serpapi" && isSerpApiInCooldown()) {
          console.warn("[v0] rate-shopper-pull: quota SerpApi esaurita, interrompo i restanti hotel")
          quotaHit = true
          break
        }
        try {
          const rates = await provider.fetchRates({
            hotelId,
            from,
            to,
            competitors: (hotelComps ?? []).map((c) => ({ id: c.id, externalRef: c.external_ref, name: c.name })),
          })
          if (rates.length === 0) continue

          const capturedAt = new Date().toISOString()
          const rows = rates.map((r) => ({
            hotel_id: hotelId,
            competitor_id: r.competitorRef, // l'adapter mappa external_ref -> competitor.id
            stay_date: r.stayDate,
            captured_at: capturedAt,
            los: r.los,
            occupancy: r.occupancy,
            price: r.price,
            currency: r.currency,
            availability: r.availability,
            channel: r.channel ?? null,
            provider: provider.key,
            raw_data: r.raw ?? null,
          }))

          const { error: upErr } = await supabase
            .from("competitor_rates")
            .upsert(rows, { onConflict: "competitor_id,stay_date,los,occupancy,captured_at" })
          if (upErr) {
            logSupabaseError(`rate-shopper-pull: upsert hotel ${hotelId}`, upErr)
            continue
          }
          pulled += rows.length
          providerPulled += rows.length
          results[`${provider.key}:${hotelId}`] = rows.length
        } catch (err) {
          console.error(`[v0] rate-shopper-pull: errore ${provider.key} hotel ${hotelId}:`, err)
        }
      }

      // Registra l'esito di questo provider (quota a livello account).
      if (quotaHit && providerPulled === 0) {
        await recordProviderOutcome(provider.key, "quota_exceeded", "Quota esaurita durante il cron")
      } else if (providerPulled > 0) {
        await recordProviderOutcome(provider.key, "ok")
      } else {
        await recordProviderOutcome(provider.key, "no_data", "Nessun prezzo restituito dal cron")
      }
    }

    return NextResponse.json({ ok: true, pulled, results })
  } catch (error) {
    console.error("[v0] rate-shopper-pull cron error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
