import { createServiceRoleClient } from "@/lib/supabase/server"
import { isServiceUnavailableError, logSupabaseError } from "@/lib/supabase/error-utils"
import { NextRequest, NextResponse } from "next/server"
import { calculateAllKVariables, storeKVariableValues } from "@/lib/pricing/k-variables-service"
import { updateHotelWeatherForecasts } from "@/lib/services/weather-service"
import { maybeActivatePending } from "@/lib/web-traffic/pricing-activation"

// Cron job to calculate K values for hotels based on per-hotel settings
// Runs frequently (e.g., every 3 hours) but only processes hotels whose next_run is due
// Settings are stored in pms_cron_settings table with module = 'pricing'

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret in production
    const authHeader = request.headers.get("authorization")
    if (process.env.VERCEL_ENV === "production" && process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    console.log("[v0] K-values cron job started")

    const supabase = await createServiceRoleClient()
    const now = new Date()

    // FIX 16/05/2026: il cron schedulato ogni 3h era SEQUENZIALE su 7 hotel ×
    // 181 date = 1.267 iterazioni Supabase. Hotel 1 ~10s, hotel 2 ~95s, hotel
    // 3 ~190s, hotel 4+ MAI raggiunti per timeout 300s. Risultato: gli ultimi
    // 4 hotel non venivano aggiornati per giorni (vedi log 16/05).
    //
    // Soluzione: ogni invocation processa al massimo 1 hotel scegliendo quello
    // con `next_run` piu' vecchio (NULLS FIRST per gli hotel senza settings).
    // Schedule cron portato a ogni 30 minuti (vercel.json). Con 7 hotel attivi
    // e 48 invocations/giorno, ogni hotel viene processato in media ogni
    // 48/7 = ~6.8 volte/giorno, vicino alla frequenza richiesta "every_3_hours".
    // Le 181 date dentro l'hotel sono parallelizzate con concorrenza 5 (da
    // ~95s a ~20s per hotel), restando ampiamente entro 300s.

    // Get all active hotels first
    const { data: allActiveHotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, name, latitude, longitude")
      .eq("is_active", true)

    if (hotelsError) {
      // FIX 31/05/2026: outage Supabase (gateway 5xx -> HTML) -> log
      // compatto + 503 transitorio invece di 500 con blob HTML.
      logSupabaseError("calculate-k-values: fetch active hotels", hotelsError)
      const transient = isServiceUnavailableError(hotelsError)
      return NextResponse.json(
        { error: transient ? "Supabase temporarily unavailable" : hotelsError.message },
        { status: transient ? 503 : 500 },
      )
    }

    // Get pricing settings (we want OLDEST next_run first, including null)
    const { data: hotelSettings } = await supabase
      .from("pms_cron_settings")
      .select("hotel_id, enabled, frequency, next_run, last_run")
      .eq("module", "pricing")
      .eq("enabled", true)

    const settingsMap = new Map<string, { frequency: string; next_run: string | null }>(
      (hotelSettings || []).map((s: any) => [s.hotel_id, { frequency: s.frequency, next_run: s.next_run }])
    )

    // Combine and rank: hotels due for processing (next_run null OR <= now), ordered by next_run ASC NULLS FIRST.
    // Pick ONLY the most overdue hotel per invocation.
    const nowMs = now.getTime()
    const ranked = (allActiveHotels || [])
      .map(h => {
        const settings = settingsMap.get(h.id)
        const nextRun = settings?.next_run ? new Date(settings.next_run).getTime() : null
        return {
          ...h,
          frequency: settings?.frequency || "every_3_hours",
          hasSettings: !!settings,
          nextRunMs: nextRun,
          // Score: lower = more overdue. NULL = -Infinity (highest priority).
          score: nextRun ?? -Infinity,
        }
      })
      .filter(h => h.nextRunMs === null || h.nextRunMs <= nowMs)
      .sort((a, b) => a.score - b.score)

    const hotelsToProcess = ranked.slice(0, 1)

    if (hotelsToProcess.length === 0) {
      console.log("[v0] No hotels due for K-values processing (ranked:", ranked.length, ")")
      return NextResponse.json({ message: "No hotels due for processing", due_count: ranked.length })
    }

    console.log(
      "[v0] Processing 1 hotel of",
      ranked.length,
      "due:",
      hotelsToProcess[0].name,
      "(next_run:",
      hotelsToProcess[0].nextRunMs ? new Date(hotelsToProcess[0].nextRunMs).toISOString() : "NULL",
      ")",
    )

    // FIX 13/05/2026: l'orizzonte fisso a 30gg lasciava il motore prezzi senza
    // dati K dal 31esimo giorno in poi -> tutte le variabili tornavano a
    // default_weight=5. Esteso a 180gg. Per backfill piu' lunghi (es. 365)
    // usare il POST manuale.
    const HORIZON_DAYS = 180
    const dates: string[] = []
    const today = new Date()
    for (let i = 0; i <= HORIZON_DAYS; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().split("T")[0])
    }

    const results: Array<{
      hotel_id: string
      hotel_name: string
      dates_processed: number
      weather_updated: boolean
      next_run: string | null
    }> = []

    // Frequency to milliseconds mapping
    const frequencyMs: Record<string, number> = {
      every_15_min: 15 * 60 * 1000,
      every_30_min: 30 * 60 * 1000,
      hourly: 60 * 60 * 1000,
      every_3_hours: 3 * 60 * 60 * 1000,
      every_6_hours: 6 * 60 * 60 * 1000,
      every_12_hours: 12 * 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    }

    for (const hotel of hotelsToProcess) {
      try {
        // First, update weather forecasts if hotel has coordinates
        let weatherUpdated = false
        if (hotel.latitude && hotel.longitude) {
          try {
            await updateHotelWeatherForecasts(
              hotel.id,
              hotel.latitude,
              hotel.longitude
            )
            weatherUpdated = true
          } catch (weatherErr) {
            console.error("[v0] Weather update failed for hotel:", hotel.id, weatherErr)
          }
        }

        // Calculate K values for each date.
        // FIX 13/05/2026: usiamo `storeKVariableValues` invece dell'upsert
        // manuale, cosi' i K calcolati vengono mirrorati anche in
        // `pricing_algo_params.var_*` (bridge Sistema A -> Sistema B). Prima
        // il cron scriveva SOLO in k_variable_values e il motore prezzi non
        // li vedeva mai -> tutte le variabili restavano fisse a default_weight=5
        // sulle date future. Vedi anche calculate-suggested-price.ts -> calculateK.
        //
        // FIX 16/05/2026: parallelizzato con concorrenza 5 per ridurre il tempo
        // per-hotel da ~95-190s a ~20-30s (sequenziale: 181 date × ~0.5-1s = >90s).
        const CONCURRENCY = 5
        let dateErrors = 0
        for (let i = 0; i < dates.length; i += CONCURRENCY) {
          const chunk = dates.slice(i, i + CONCURRENCY)
          const results = await Promise.allSettled(
            chunk.map(async (date) => {
              const kValues = await calculateAllKVariables(supabase, hotel.id, date)
              await storeKVariableValues(hotel.id, date, kValues.variables)
            })
          )
          for (const r of results) {
            if (r.status === "rejected") dateErrors++
          }
        }
        if (dateErrors > 0) {
          console.error(`[v0] K-values: ${dateErrors}/${dates.length} dates failed for hotel`, hotel.id)
        }

        // 14/06/2026: attivazione differita "domanda diretta" (addon Traffico
        // web). Se l'hotel ha scelto "attiva dopo 10 giorni di dati" e la
        // soglia e' raggiunta, crea l'override di peso. Silenziosa/idempotente.
        await maybeActivatePending(supabase, hotel.id)

        // Update last_run and calculate next_run based on hotel's frequency
        const intervalMs = frequencyMs[hotel.frequency] || frequencyMs["every_3_hours"]
        const nextRun = new Date(now.getTime() + intervalMs)

        // Upsert pms_cron_settings for this hotel
        await supabase
          .from("pms_cron_settings")
          .upsert(
            {
              hotel_id: hotel.id,
              module: "pricing",
              enabled: true,
              frequency: hotel.frequency || "every_3_hours",
              last_run: now.toISOString(),
              next_run: nextRun.toISOString(),
              updated_at: now.toISOString(),
            },
            { onConflict: "hotel_id,module" }
          )

        results.push({
          hotel_id: hotel.id,
          hotel_name: hotel.name,
          dates_processed: dates.length,
          weather_updated: weatherUpdated,
          next_run: nextRun.toISOString(),
        })
      } catch (hotelErr) {
        console.error("[v0] Error processing hotel:", hotel.id, hotelErr)
      }
    }

    console.log("[v0] K-values cron job completed. Hotels processed:", results.length)

    return NextResponse.json({
      success: true,
      hotels_processed: results.length,
      dates_per_hotel: dates.length,
      results,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] K-values cron job error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST manuale - backfill on-demand dei K values per UN singolo hotel.
 *
 * Auth: stesso CRON_SECRET del GET schedulato (Bearer header).
 * Body JSON:
 *   - hotel_id: string  (UUID, obbligatorio)
 *   - days_ahead?: number   (default 30, max 180)
 *   - skip_weather?: boolean  (default false)
 *
 * Usato per:
 *   - recovery dopo bug fix (il GET schedulato gira ogni 3h - per anticipare
 *     basta lanciare manualmente questo endpoint)
 *   - calibrazione/diagnostica K-driven su un hotel specifico
 *
 * Tutti i nuovi K values vengono mirrorati in `pricing_algo_params.var_*` via
 * `storeKVariableValues`, quindi il motore prezzi li vede immediatamente.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: stesso secret del cron
    const authHeader = request.headers.get("authorization")
    if (process.env.VERCEL_ENV === "production" && process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const hotelId: string | undefined = body?.hotel_id
    // 13/05/2026: alzato max a 365 (anno intero) per backfill straordinari.
    // Default 30 mantenuto per compatibilita' eventuali script automatici.
    const daysAheadRaw = Number(body?.days_ahead ?? 30)
    const daysAhead = Math.max(1, Math.min(365, Number.isFinite(daysAheadRaw) ? daysAheadRaw : 30))
    const skipWeather = body?.skip_weather === true

    if (!hotelId || typeof hotelId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid `hotel_id` in body" },
        { status: 400 },
      )
    }

    const supabase = await createServiceRoleClient()

    const { data: hotel, error: hotelErr } = await supabase
      .from("hotels")
      .select("id, name, latitude, longitude, is_active")
      .eq("id", hotelId)
      .maybeSingle()

    if (hotelErr || !hotel) {
      return NextResponse.json(
        { error: hotelErr?.message || "Hotel not found" },
        { status: 404 },
      )
    }

    console.log(`[v0] K-values manual backfill: hotel=${hotel.name} (${hotel.id}), days_ahead=${daysAhead}`)

    // Genera finestra date oggi -> oggi+N
    const dates: string[] = []
    const today = new Date()
    for (let i = 0; i <= daysAhead; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().split("T")[0])
    }

    // Aggiorna weather solo se non escluso esplicitamente
    let weatherUpdated = false
    if (!skipWeather && hotel.latitude && hotel.longitude) {
      try {
        await updateHotelWeatherForecasts(hotel.id, hotel.latitude, hotel.longitude)
        weatherUpdated = true
      } catch (weatherErr) {
        console.error("[v0] Manual backfill - weather update failed:", weatherErr)
      }
    }

    let datesOk = 0
    let datesFailed = 0
    for (const date of dates) {
      try {
        const kValues = await calculateAllKVariables(supabase, hotel.id, date)
        await storeKVariableValues(hotel.id, date, kValues.variables)
        datesOk++
      } catch (dateErr) {
        datesFailed++
        console.error(`[v0] Manual backfill - date ${date} failed:`, dateErr)
      }
    }

    console.log(`[v0] K-values manual backfill done: ${datesOk}/${dates.length} dates ok`)

    return NextResponse.json({
      success: true,
      hotel_id: hotel.id,
      hotel_name: hotel.name,
      days_ahead: daysAhead,
      dates_processed: dates.length,
      dates_ok: datesOk,
      dates_failed: datesFailed,
      weather_updated: weatherUpdated,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] K-values manual backfill error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
