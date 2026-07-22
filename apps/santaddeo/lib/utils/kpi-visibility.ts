import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Check whether a KPI should be shown in the dashboard.
 * If the hotel has no row for that kpi_key the card is visible by default.
 */
export function isKpiEnabled(
  kpiConfigs: Record<string, boolean> | null | undefined,
  kpiKey: string
): boolean {
  if (!kpiConfigs) return true
  if (kpiKey in kpiConfigs) return kpiConfigs[kpiKey]
  return true // default visible if no config exists
}

/**
 * Lista standard dei KPI con valori di default.
 * Ogni nuovo hotel riceve automaticamente questi KPI.
 */
const DEFAULT_KPI_CONFIGS: Array<{
  kpi_key: string
  label: string
  description: string
  is_enabled: boolean
  display_order: number
}> = [
  { kpi_key: "rooms_available", label: "Camere Disponibili", description: "Camere libere per la data selezionata", is_enabled: true, display_order: 1 },
  { kpi_key: "rooms_occupied", label: "Camere Occupate", description: "Camere occupate per la data selezionata", is_enabled: true, display_order: 2 },
  { kpi_key: "out_of_service", label: "Fuori Servizio", description: "Camere fuori servizio per la data selezionata", is_enabled: false, display_order: 3 },
  { kpi_key: "arrivals_departures", label: "Arrivi e Partenze", description: "Arrivi e partenze per la data selezionata", is_enabled: true, display_order: 7 },
  { kpi_key: "bookings_received", label: "Prenotazioni Ricevute", description: "Prenotazioni ricevute oggi", is_enabled: true, display_order: 8 },
  { kpi_key: "cancellations_received", label: "Cancellazioni Ricevute", description: "Cancellazioni ricevute oggi", is_enabled: true, display_order: 9 },
  { kpi_key: "overview_occupancy", label: "Occupazione", description: "Tasso di occupazione camere", is_enabled: true, display_order: 1 },
  { kpi_key: "overview_adr", label: "ADR", description: "Average Daily Rate", is_enabled: true, display_order: 2 },
  { kpi_key: "overview_revpar", label: "RevPAR", description: "Revenue Per Available Room", is_enabled: true, display_order: 3 },
  { kpi_key: "overview_revenue", label: "Ricavo Camere", description: "Ricavo totale camere del giorno", is_enabled: true, display_order: 4 },
  { kpi_key: "overview_arrivals", label: "Arrivi", description: "Check-in del giorno", is_enabled: true, display_order: 5 },
  { kpi_key: "overview_departures", label: "Partenze", description: "Check-out del giorno", is_enabled: true, display_order: 6 },
  { kpi_key: "overview_in_house", label: "In House", description: "Ospiti attualmente in struttura", is_enabled: true, display_order: 7 },
  { kpi_key: "overview_availability", label: "Disponibilita", description: "Camere disponibili", is_enabled: true, display_order: 8 },
  { kpi_key: "overview_production", label: "Produzione", description: "Produzione fiscale del periodo", is_enabled: true, display_order: 9 },
  { kpi_key: "fiscal_production_today", label: "Produzione Fiscale Oggi", description: "Produzione fiscale IVA inclusa dal PMS per la data", is_enabled: true, display_order: 5 },
  { kpi_key: "fiscal_production_month", label: "Produzione Fiscale Mese", description: "Produzione fiscale IVA inclusa dal PMS per il mese", is_enabled: true, display_order: 4 },
  { kpi_key: "room_production_today", label: "Produzione Camere Oggi", description: "Somma daily_price camere occupate nella data", is_enabled: true, display_order: 6 },
  { kpi_key: "metrics_occupancy", label: "Occupazione", description: "Card occupazione nella sezione metriche", is_enabled: true, display_order: 10 },
  { kpi_key: "metrics_adr", label: "ADR", description: "Card ADR nella sezione metriche", is_enabled: true, display_order: 11 },
  { kpi_key: "metrics_room_revenue", label: "Ricavo Camere", description: "Card ricavo camere nella sezione metriche", is_enabled: true, display_order: 13 },
  { kpi_key: "metrics_total_production", label: "Produzione Totale", description: "Card produzione totale nella sezione metriche", is_enabled: true, display_order: 14 },
  { kpi_key: "metrics_arrivals", label: "Arrivi", description: "Card arrivi nella sezione metriche", is_enabled: true, display_order: 15 },
  { kpi_key: "metrics_departures", label: "Partenze", description: "Card partenze nella sezione metriche", is_enabled: true, display_order: 16 },
  { kpi_key: "metrics_in_house", label: "In House", description: "Card in house nella sezione metriche", is_enabled: true, display_order: 17 },
  { kpi_key: "metrics_new_bookings", label: "Nuove Prenotazioni", description: "Card nuove prenotazioni nella sezione metriche", is_enabled: true, display_order: 18 },
  { kpi_key: "metrics_avg_stay", label: "Permanenza Media", description: "Card permanenza media nella sezione metriche", is_enabled: true, display_order: 20 },
  { kpi_key: "metrics_revpar", label: "RevPAR", description: "Revenue per camera disponibile", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_revpor", label: "RevPOR", description: "Revenue per camera occupata", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_room_nights", label: "Room/Nights", description: "Notti camera vendute anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_total_revenue", label: "Revenue Totale", description: "Revenue totale anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_direct_revenue", label: "Revenue Diretto", description: "Revenue diretto anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_intermediated_revenue", label: "Rev. Intermediato", description: "Revenue intermediato anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_bookings", label: "Prenotazioni", description: "Prenotazioni anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_cancellations", label: "Cancellazioni", description: "Cancellazioni anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_cancellation_pct", label: "% Cancellazioni", description: "Percentuale cancellazioni anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_pickup_bookings", label: "Pick Up Pren.", description: "Pick up prenotazioni anno in corso", is_enabled: true, display_order: 0 },
  { kpi_key: "metrics_pickup_cancellations", label: "Pick Up Canc.", description: "Pick up cancellazioni anno in corso", is_enabled: true, display_order: 0 },
]

/**
 * Inserisce automaticamente i KPI di default per un nuovo hotel.
 * Usa i default del piano dalla tabella kpi_plan_defaults se disponibili,
 * altrimenti usa i default hardcoded.
 * Accetta un client Supabase con service_role (non autenticato) per bypassare RLS.
 */
export async function seedDefaultKpiConfigs(
  supabaseAdmin: SupabaseClient,
  hotelId: string,
  planType?: string // "free" | "fixed_fee" | "commission"
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Determine the plan type if not provided
    let resolvedPlanType = planType
    if (!resolvedPlanType) {
      const { data: sub } = await supabaseAdmin
        .from("accelerator_subscriptions")
        .select("plan_type")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .maybeSingle()
      
      resolvedPlanType = sub?.plan_type || "free"
    }

    // Try to get plan defaults from kpi_plan_defaults table
    const { data: planDefaults } = await supabaseAdmin
      .from("kpi_plan_defaults")
      .select("kpi_key, is_enabled")
      .eq("plan_type", resolvedPlanType)

    // Create a map of plan defaults for quick lookup
    const planDefaultsMap: Record<string, boolean> = {}
    if (planDefaults && planDefaults.length > 0) {
      for (const pd of planDefaults) {
        planDefaultsMap[pd.kpi_key] = pd.is_enabled
      }
    }

    // Merge hardcoded defaults with plan defaults (plan defaults take precedence)
    const rows = DEFAULT_KPI_CONFIGS.map((kpi) => ({
      hotel_id: hotelId,
      ...kpi,
      // Use plan default if available, otherwise use hardcoded default
      is_enabled: kpi.kpi_key in planDefaultsMap ? planDefaultsMap[kpi.kpi_key] : kpi.is_enabled,
    }))

    const { data, error } = await supabaseAdmin
      .from("dashboard_kpi_configs")
      .upsert(rows, { onConflict: "hotel_id,kpi_key", ignoreDuplicates: true })
      .select("id")

    if (error) {
      console.error(`[KPI Seed] Error seeding KPIs for hotel ${hotelId}:`, error.message)
      return { success: false, count: 0, error: error.message }
    }

    console.log(`[KPI Seed] Seeded ${data?.length ?? 0} KPIs for hotel ${hotelId} (plan: ${resolvedPlanType})`)
    return { success: true, count: data?.length ?? 0 }
  } catch (err: any) {
    console.error(`[KPI Seed] Unexpected error for hotel ${hotelId}:`, err)
    return { success: false, count: 0, error: err.message }
  }
}
