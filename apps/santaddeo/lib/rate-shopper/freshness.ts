import type { SupabaseClient } from "@supabase/supabase-js"

export interface CompetitorFreshness {
  id: string
  name: string
  lastPull: string | null
  pulledToday: boolean
  coverageDays: number
  stale: boolean
}

export interface HotelFreshness {
  autoRefreshable: boolean
  stale: boolean
  coverageDays: number
  pulledToday: boolean
  competitors: CompetitorFreshness[]
  staleCompetitorIds: string[]
}

/**
 * Calcola la freschezza dei prezzi PER COMPETITOR (non a livello hotel).
 * Un competitor e' "stale" se non ha avuto un pull OGGI (incluso il caso "mai
 * scaricato", es. competitor appena aggiunto). L'hotel e' stale se ALMENO UN
 * competitor auto-aggiornabile e' stale: cosi' aggiungere un nuovo competitor
 * forza il refresh anche se gli altri sono gia' aggiornati.
 *
 * NB: NON usiamo la copertura futura come segnale di staleness. Alcune property
 * (tipicamente le piu' piccole) non pubblicano su Google Hotels prezzi oltre
 * ~40 giorni: e' un limite reale del dato, non un pull parziale. Basarsi sulla
 * copertura li terrebbe "stale" per sempre -> refresh ad ogni visita -> spreco
 * di quota SerpApi. Il provider tenta comunque sempre l'orizzonte completo.
 */
export async function computeFreshness(
  supabase: SupabaseClient,
  hotelId: string,
): Promise<HotelFreshness> {
  const today = new Date().toISOString().slice(0, 10)
  const todayMs = new Date(today).getTime()

  // Competitor auto-aggiornabili: serpapi attivi con property_token.
  const { data: comps } = await supabase
    .from("competitors")
    .select("id, name, external_ref")
    .eq("hotel_id", hotelId)
    .eq("provider", "serpapi")
    .eq("active", true)

  const refreshable = (comps ?? []).filter((c) => c.external_ref)
  const autoRefreshable = refreshable.length > 0

  const competitors: CompetitorFreshness[] = []
  for (const c of refreshable) {
    const [{ data: last }, { data: furthest }] = await Promise.all([
      supabase
        .from("competitor_rates")
        .select("captured_at")
        .eq("competitor_id", c.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("competitor_rates")
        .select("stay_date")
        .eq("competitor_id", c.id)
        .gte("stay_date", today)
        .order("stay_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const lastPull = last?.captured_at ?? null
    const pulledToday = !!lastPull && lastPull.slice(0, 10) === today
    const coverageDays = furthest?.stay_date
      ? Math.round((new Date(furthest.stay_date).getTime() - todayMs) / 86_400_000)
      : 0
    // Stale = non scaricato oggi (include "mai scaricato"). La copertura e' solo
    // informativa (vedi nota sopra: i ceiling di Google non sono staleness).
    const stale = !pulledToday

    competitors.push({ id: c.id, name: c.name, lastPull, pulledToday, coverageDays, stale })
  }

  const staleCompetitorIds = competitors.filter((c) => c.stale).map((c) => c.id)
  const coverageDays = competitors.length ? Math.max(...competitors.map((c) => c.coverageDays)) : 0
  const pulledToday = competitors.length > 0 && competitors.every((c) => c.pulledToday)
  const stale = autoRefreshable && staleCompetitorIds.length > 0

  return {
    autoRefreshable,
    stale,
    coverageDays,
    pulledToday,
    competitors,
    staleCompetitorIds,
  }
}
