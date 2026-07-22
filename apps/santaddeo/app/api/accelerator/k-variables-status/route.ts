/**
 * GET /api/accelerator/k-variables-status?hotel_id=<uuid>
 *
 * Per ciascuna riga di `pricing_variables` (tabella globale), risolve la
 * chiave nel registry ufficiale Santaddeo e calcola lo STATO PER-HOTEL:
 *
 *   - "ok"            datasource OK + dati recenti (entro freshnessDays)
 *   - "setup_missing" il tenant deve configurare un connettore (es. PMS, OTA
 *                     report, recensioni, coordinate hotel). UI invita a
 *                     configurare.
 *   - "data_stale"    setup OK ma dati piu' vecchi di freshnessDays. La
 *                     variabile e' considerata BLOCCATA SU NEUTRO (5) e la
 *                     UI lancia ALERT.
 *   - "not_integrated" datasource non ancora supportato lato piattaforma
 *                      (compset rate-shopper). Variabile non attivabile.
 *   - "manual"        input manuale (sempre OK, no setup-check).
 *   - "auto_internal" calendario/festivita interne (sempre OK).
 *   - "custom"        chiave non presente nel registry ufficiale (variabile
 *                     custom del tenant). Trattata come manuale.
 *
 * Vincoli architetturali (rispettati):
 *   - Nessuna scrittura su pricing_grid / pricing_algo_params
 *   - Nessuna modifica al motore prezzi (calculate-suggested-price.ts)
 *   - Nessuna modifica al cron K-values (k-variables-service.ts)
 *   - Nessuna migration DB, solo SELECT su tabelle gia' esistenti
 *   - Read-only: questo endpoint non scrive mai nulla
 */

import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import {
  getKVariableSourceMetadata,
  type KVariableSourceMetadata,
} from "@/lib/pricing/k-variable-source-metadata"
import { getProviderState } from "@/lib/rate-shopper/provider-state"

export const dynamic = "force-dynamic"

interface KVariableStatusItem {
  variable_key: string
  status:
    | "ok"
    | "setup_missing"
    | "data_stale"
    | "not_integrated"
    | "manual"
    | "auto_internal"
    | "custom"
  source_kind: string
  datasource_label: string
  setup_link: string | null
  setup_cta: string | null
  /** ISO timestamp dell'ultimo dato disponibile sulla tabella sorgente. */
  last_data_at: string | null
  /** Giorni dall'ultimo dato. Negativo o null se non applicabile. */
  days_since_last_data: number | null
  /** True se la variabile e' attivabile dall'utente (Switch enabled). */
  can_activate: boolean
  /** Spiegazione naturale per l'utente. NIENTE jargon ETL/pipeline. */
  message: string
  /** Help text per tooltip. */
  help_text: string
  /** Se true, e' un alert critico da mostrare in banner globale. */
  is_alert: boolean
}

interface KVariableStatusResponse {
  hotel_id: string
  generated_at: string
  /** Indicizzato per variable_key per lookup veloce lato UI. */
  by_key: Record<string, KVariableStatusItem>
  /**
   * Lista alert critici (status=data_stale per variabili ATTIVE). Il
   * frontend mostra un banner rosso con queste voci se non vuoto.
   */
  alerts: Array<{
    variable_key: string
    message: string
    days_since_last_data: number | null
    setup_link: string | null
    setup_cta: string | null
  }>
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const hotelId = url.searchParams.get("hotel_id")
    if (!hotelId) {
      return NextResponse.json(
        { error: "Missing hotel_id parameter" },
        { status: 400 },
      )
    }

    const supabase = await createServerClient()

    // Auth via Supabase session (il client redirige a /auth/login se manca)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Hotel context (lat/lng + active flag)
    const { data: hotel, error: hotelErr } = await supabase
      .from("hotels")
      .select("id, latitude, longitude, is_active")
      .eq("id", hotelId)
      .maybeSingle()
    if (hotelErr || !hotel) {
      return NextResponse.json(
        { error: hotelErr?.message || "Hotel not found" },
        { status: 404 },
      )
    }
    const hasCoordinates =
      hotel.latitude !== null && hotel.longitude !== null

    // PMS check: integration attiva con sync recente
    const { data: pmsIntegration } = await supabase
      .from("pms_integrations")
      .select("is_active, last_sync_at")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const pmsConfigured = pmsIntegration?.is_active === true
    const pmsLastSyncAt = pmsIntegration?.last_sync_at ?? null

    // OTA reports check: ultimo snapshot caricato
    const { data: otaSnapshot } = await supabase
      .from("hotel_ota_kpi_snapshots")
      .select("period_end, created_at")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const otaConfigured = !!otaSnapshot
    const otaLastDataAt =
      otaSnapshot?.created_at ?? otaSnapshot?.period_end ?? null

    // Reviews check: ultima recensione importata
    const { data: lastReview } = await supabase
      .from("hotel_reviews")
      .select("review_date, created_at")
      .eq("hotel_id", hotelId)
      .order("review_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    const reviewsConfigured = !!lastReview
    const reviewsLastDataAt =
      lastReview?.review_date ?? lastReview?.created_at ?? null

    // Weather check: ultima previsione popolata
    const { data: lastWeather } = await supabase
      .from("weather_forecasts")
      .select("date")
      .eq("hotel_id", hotelId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle()
    const weatherLastDataAt = lastWeather?.date ?? null

    // Compset check (rate-shopper): ultima cattura prezzi competitor
    const { data: lastCompset } = await supabase
      .from("competitor_rates")
      .select("captured_at")
      .eq("hotel_id", hotelId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const compsetConfigured = !!lastCompset
    const compsetLastDataAt = lastCompset?.captured_at ?? null
    // Esito dell'ultimo pull rate-shopper (provider serpapi/Google Hotels): se
    // la quota e' esaurita la UI deve dire la VERA causa, non "da configurare".
    const compsetProviderState = await getProviderState("serpapi")
    const compsetQuotaExceeded = compsetProviderState?.last_outcome === "quota_exceeded"

    // Web traffic check: addon "web_traffic" attivo + ultime RICERCHE di
    // soggiorno catturate. E' lo stesso gate del calcolatore k_direct_demand
    // (addon + site_search_daily): senza ricerche il segnale per-data e' neutro.
    const { data: webTrafficAddon } = await supabase
      .from("addon_subscriptions")
      .select("status")
      .eq("hotel_id", hotelId)
      .eq("addon_type", "web_traffic")
      .in("status", ["active", "trialing"])
      .limit(1)
    const webTrafficAddonActive = (webTrafficAddon?.length ?? 0) > 0
    const { data: lastSearch } = await supabase
      .from("site_search_daily")
      .select("last_searched_at")
      .eq("hotel_id", hotelId)
      .order("last_searched_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const webTrafficLastDataAt = lastSearch?.last_searched_at ?? null

    // Carica TUTTE le pricing_variables (registry globale)
    const { data: pricingVars, error: pvErr } = await supabase
      .from("pricing_variables")
      .select("variable_key, is_active")
    if (pvErr) {
      return NextResponse.json({ error: pvErr.message }, { status: 500 })
    }

    const now = Date.now()
    function daysBetween(iso: string | null): number | null {
      if (!iso) return null
      const t = new Date(iso).getTime()
      if (Number.isNaN(t)) return null
      return Math.floor((now - t) / (1000 * 60 * 60 * 24))
    }

    function classify(
      meta: KVariableSourceMetadata,
      isActive: boolean,
    ): KVariableStatusItem {
      const base = {
        variable_key: meta.key,
        source_kind: meta.sourceKind,
        datasource_label: meta.datasourceLabel,
        setup_link: meta.setupLink,
        setup_cta: meta.setupCta,
        help_text: meta.helpText,
      }

      switch (meta.sourceKind) {
        case "auto-internal":
          return {
            ...base,
            status: "auto_internal",
            last_data_at: null,
            days_since_last_data: null,
            can_activate: true,
            message: "Si calcola automaticamente, nessuna configurazione richiesta.",
            is_alert: false,
          }

        case "manual":
          return {
            ...base,
            status: "manual",
            last_data_at: null,
            days_since_last_data: null,
            can_activate: true,
            message:
              "Variabile manuale: imposti il valore giorno per giorno nella tabella prezzi.",
            is_alert: false,
          }

        case "request":
          return {
            ...base,
            status: "not_integrated",
            last_data_at: null,
            days_since_last_data: null,
            can_activate: false,
            message:
              "Variabile non ancora disponibile: integrazione in arrivo nelle prossime versioni di Santaddeo.",
            is_alert: false,
          }

        case "auto-pms": {
          if (!pmsConfigured) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: !meta.blockActivationWithoutSetup,
              message:
                "Il PMS della struttura non risulta ancora collegato. Configuralo per attivare questa variabile.",
              is_alert: false,
            }
          }
          const days = daysBetween(pmsLastSyncAt)
          const stale =
            days !== null &&
            meta.freshnessDays > 0 &&
            days > meta.freshnessDays
          if (stale && isActive) {
            return {
              ...base,
              status: "data_stale",
              last_data_at: pmsLastSyncAt,
              days_since_last_data: days,
              can_activate: true,
              message: `Il PMS non sincronizza da ${days} giorni: la variabile e' temporaneamente bloccata su 5 (neutro). Verifica il collegamento del PMS.`,
              is_alert: true,
            }
          }
          return {
            ...base,
            status: "ok",
            last_data_at: pmsLastSyncAt,
            days_since_last_data: days,
            can_activate: true,
            message: "Dati PMS aggiornati.",
            is_alert: false,
          }
        }

        case "auto-weather": {
          if (!hasCoordinates) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: !meta.blockActivationWithoutSetup,
              message:
                "Mancano le coordinate geografiche della struttura. Impostale per attivare le previsioni meteo.",
              is_alert: false,
            }
          }
          const days = daysBetween(weatherLastDataAt)
          const stale =
            days !== null &&
            meta.freshnessDays > 0 &&
            days > meta.freshnessDays
          if (stale && isActive) {
            return {
              ...base,
              status: "data_stale",
              last_data_at: weatherLastDataAt,
              days_since_last_data: days,
              can_activate: true,
              message: `Le previsioni meteo non vengono aggiornate da ${days} giorni: la variabile e' temporaneamente bloccata su 5 (neutro).`,
              is_alert: true,
            }
          }
          return {
            ...base,
            status: "ok",
            last_data_at: weatherLastDataAt,
            days_since_last_data: days,
            can_activate: true,
            message: "Previsioni meteo aggiornate.",
            is_alert: false,
          }
        }

        case "auto-reviews": {
          if (!reviewsConfigured) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: !meta.blockActivationWithoutSetup,
              message:
                "La sincronizzazione delle recensioni non e' ancora attiva. Configurala per usare lo score reputazione.",
              is_alert: false,
            }
          }
          const days = daysBetween(reviewsLastDataAt)
          const stale =
            days !== null &&
            meta.freshnessDays > 0 &&
            days > meta.freshnessDays
          if (stale && isActive) {
            return {
              ...base,
              status: "data_stale",
              last_data_at: reviewsLastDataAt,
              days_since_last_data: days,
              can_activate: true,
              message: `Le recensioni non vengono aggiornate da ${days} giorni: la variabile e' temporaneamente bloccata su 5 (neutro).`,
              is_alert: true,
            }
          }
          return {
            ...base,
            status: "ok",
            last_data_at: reviewsLastDataAt,
            days_since_last_data: days,
            can_activate: true,
            message: "Recensioni aggiornate.",
            is_alert: false,
          }
        }

        case "auto-ota-manual": {
          if (!otaConfigured) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: !meta.blockActivationWithoutSetup,
              message:
                "Per attivare questa variabile devi caricare manualmente i report Booking/Expedia almeno una volta al mese. Senza upload la variabile resta neutra (5).",
              is_alert: false,
            }
          }
          const days = daysBetween(otaLastDataAt)
          const stale =
            days !== null &&
            meta.freshnessDays > 0 &&
            days > meta.freshnessDays
          if (stale && isActive) {
            return {
              ...base,
              status: "data_stale",
              last_data_at: otaLastDataAt,
              days_since_last_data: days,
              can_activate: true,
              message: `Non risultano report Booking/Expedia caricati da ${days} giorni: la variabile e' bloccata su 5 (neutro). Carica i report aggiornati per riattivarla.`,
              is_alert: true,
            }
          }
          return {
            ...base,
            status: "ok",
            last_data_at: otaLastDataAt,
            days_since_last_data: days,
            can_activate: true,
            message: "Report Booking/Expedia aggiornati.",
            is_alert: false,
          }
        }

        case "auto-compset": {
          // Quando il pull fallisce per QUOTA del provider (es. Google Hotels /
          // SerpApi), spieghiamo la VERA causa: non e' un setup mancante ne' una
          // negligenza, e' la quota account esaurita. Cosi' l'utente sa che deve
          // aumentare il piano / attendere il reset, non "configurare" qualcosa.
          const quotaSuffix = compsetQuotaExceeded
            ? " La causa e' la quota del monitoraggio prezzi (Google Hotels) esaurita: aumenta il piano del rate-shopper o attendi il reset, poi i dati torneranno automaticamente."
            : ""
          if (!compsetConfigured) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: !meta.blockActivationWithoutSetup,
              message: compsetQuotaExceeded
                ? "Il monitoraggio prezzi non ha ancora raccolto dati: la quota Google Hotels e' esaurita. Aumenta il piano del rate-shopper o attendi il reset della quota."
                : "Il monitoraggio prezzi (rate-shopper) non ha ancora raccolto dati sui competitor. Avvialo per attivare questa variabile.",
              is_alert: false,
            }
          }
          const days = daysBetween(compsetLastDataAt)
          const stale =
            days !== null &&
            meta.freshnessDays > 0 &&
            days > meta.freshnessDays
          if (stale && isActive) {
            return {
              ...base,
              status: "data_stale",
              last_data_at: compsetLastDataAt,
              days_since_last_data: days,
              can_activate: true,
              message: `Il monitoraggio prezzi non aggiorna i competitor da ${days} giorni: la variabile e' temporaneamente bloccata su 5 (neutro).${quotaSuffix || " Verifica il rate-shopper."}`,
              is_alert: true,
            }
          }
          return {
            ...base,
            status: "ok",
            last_data_at: compsetLastDataAt,
            days_since_last_data: days,
            can_activate: true,
            message: "Prezzi competitor aggiornati.",
            is_alert: false,
          }
        }

        case "auto-web-traffic": {
          if (!webTrafficAddonActive) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: !meta.blockActivationWithoutSetup,
              message:
                "Richiede l'addon Traffico Web attivo e lo script del widget recensioni installato sul sito. Attivalo dalle Impostazioni avanzate.",
              is_alert: false,
            }
          }
          if (!webTrafficLastDataAt) {
            return {
              ...base,
              status: "setup_missing",
              last_data_at: null,
              days_since_last_data: null,
              can_activate: true,
              message:
                "Addon attivo ma nessuna ricerca di date ancora catturata: assicurati che lo script del widget sia installato sulle pagine del sito dove gli ospiti cercano le date (le date vengono lette dall'URL di ricerca).",
              is_alert: false,
            }
          }
          const days = daysBetween(webTrafficLastDataAt)
          const stale =
            days !== null &&
            meta.freshnessDays > 0 &&
            days > meta.freshnessDays
          if (stale && isActive) {
            return {
              ...base,
              status: "data_stale",
              last_data_at: webTrafficLastDataAt,
              days_since_last_data: days,
              can_activate: true,
              message: `Nessuna ricerca di date catturata da ${days} giorni: il segnale di domanda per-data si raffredda. Verifica che lo script del widget sia ancora attivo sul sito.`,
              is_alert: true,
            }
          }
          return {
            ...base,
            status: "ok",
            last_data_at: webTrafficLastDataAt,
            days_since_last_data: days,
            can_activate: true,
            message: "Ricerche di date aggiornate: la domanda diretta e' calcolata per singola data.",
            is_alert: false,
          }
        }
      }
    }

    const byKey: Record<string, KVariableStatusItem> = {}
    const alerts: KVariableStatusResponse["alerts"] = []

    for (const row of pricingVars || []) {
      const meta = getKVariableSourceMetadata(row.variable_key)
      if (!meta) {
        // Chiave non nel registry ufficiale = variabile custom del tenant
        byKey[row.variable_key] = {
          variable_key: row.variable_key,
          status: "custom",
          source_kind: "custom",
          datasource_label: "Variabile personalizzata",
          setup_link: null,
          setup_cta: null,
          last_data_at: null,
          days_since_last_data: null,
          can_activate: true,
          message:
            "Variabile personalizzata gestita manualmente dal Revenue Manager.",
          help_text:
            "Questa variabile e' stata creata dall'utente e va impostata manualmente giorno per giorno.",
          is_alert: false,
        }
        continue
      }
      const status = classify(meta, row.is_active === true)
      byKey[row.variable_key] = status
      if (status.is_alert) {
        alerts.push({
          variable_key: status.variable_key,
          message: status.message,
          days_since_last_data: status.days_since_last_data,
          setup_link: status.setup_link,
          setup_cta: status.setup_cta,
        })
      }
    }

    const response: KVariableStatusResponse = {
      hotel_id: hotelId,
      generated_at: new Date().toISOString(),
      by_key: byKey,
      alerts,
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] k-variables-status error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
