/**
 * INTENSIFICATORE K — resolver puro (30/06/2026)
 * ----------------------------------------------------------------------------
 * Trasforma l'ex costante `K_INTENSITY = 0.3` (fissa, globale) in una leva
 * configurabile per-hotel, per-periodo e per-giorno.
 *
 * Il K (coefficiente di domanda, range tipico [-1, +1]) viene applicato dal
 * motore di pricing con DUE intensità distinte:
 *   - incrementIntensity: modula l'incremento di banda/occupazione e il
 *     market_demand_weight (CANALE STORICO, prima era la costante 0.3).
 *   - baseIntensity: NUOVO canale, modula direttamente il prezzo base
 *     (`base * (1 + K * baseIntensity)`). Default 0 => comportamento storico
 *     invariato finché un hotel non lo configura.
 *
 * RISOLUZIONE (precedenza, dalla più specifica alla più generale):
 *   1. regola `day`     che copre la data
 *   2. regola `period`  che copre la data (più recente vince a parità)
 *   3. regola `default` dell'hotel
 *   4. FALLBACK GLOBALE: incrementIntensity = 0.3, baseIntensity = 0
 *      (identico al motore pre-intensificatore => retrocompatibilità totale)
 *
 * Questo modulo è PURO (nessun accesso al DB): le regole vengono caricate a
 * monte (load-pricing-context lato server, fetch lato griglia) e passate qui.
 * È condiviso dalle 3 copie della formula per evitare divergenze.
 */

/** Comportamento storico del motore, usato come fallback. */
export const K_INTENSITY_GLOBAL_FALLBACK = 0.3
export const K_BASE_INTENSITY_GLOBAL_FALLBACK = 0

/** Tetti di sicurezza (coerenti con i CHECK della tabella). */
export const K_INTENSITY_INCREMENT_CAP = 0.6
export const K_INTENSITY_BASE_CAP = 0.25

/**
 * LIVELLI STANDARD (preset) — 30/06/2026.
 * Invece di far scegliere all'utente due numeri liberi (incremento/base), offriamo
 * pochi livelli predefiniti selezionabili da menù a tendina. Ogni livello mappa una
 * coppia (incremento, base): il modello dati e il motore restano INVARIATI, cambia
 * solo la UI di selezione. "Standard" = comportamento storico (retrocompatibile).
 * I valori rispettano i cap (incremento ≤ 0.6, base ≤ 0.25).
 */
export interface KIntensityPreset {
  id: string
  label: string
  description: string
  increment_intensity: number
  base_intensity: number
}

export const K_INTENSITY_PRESETS: KIntensityPreset[] = [
  {
    id: "standard",
    label: "Standard (storico)",
    description: "Comportamento attuale: K muove solo gli scatti di banda/domanda.",
    increment_intensity: 0.3,
    base_intensity: 0,
  },
  {
    id: "lieve",
    label: "Lieve",
    description: "K inizia a muovere anche il prezzo base, in modo prudente.",
    increment_intensity: 0.4,
    base_intensity: 0.05,
  },
  {
    id: "moderato",
    label: "Moderato",
    description: "Impatto bilanciato di K su base e incrementi.",
    increment_intensity: 0.5,
    base_intensity: 0.1,
  },
  {
    id: "deciso",
    label: "Deciso",
    description: "K muove il prezzo in modo marcato. Usare con dati a monte affidabili.",
    increment_intensity: 0.6,
    base_intensity: 0.15,
  },
  {
    id: "massimo",
    label: "Massimo",
    description: "Massima reattivita' di K (cap). Solo per stagioni/giorni estremi.",
    increment_intensity: 0.6,
    base_intensity: 0.25,
  },
]

/**
 * Trova il preset che corrisponde a una coppia (incremento, base). Usato per
 * mostrare nel menù il livello selezionato a partire dai valori salvati. Se non
 * c'è corrispondenza esatta (es. regole legacy create con gli slider), sceglie
 * il preset con `base_intensity` più vicina (la leva dominante).
 */
export function matchKIntensityPreset(inc: number, base: number): KIntensityPreset {
  const exact = K_INTENSITY_PRESETS.find(
    (p) => Math.abs(p.increment_intensity - inc) < 1e-6 && Math.abs(p.base_intensity - base) < 1e-6,
  )
  if (exact) return exact
  return K_INTENSITY_PRESETS.reduce((best, p) =>
    Math.abs(p.base_intensity - base) < Math.abs(best.base_intensity - base) ? p : best,
  )
}

export type KIntensityScope = "default" | "period" | "day"

export interface KIntensityRule {
  scope: KIntensityScope
  /** 'YYYY-MM-DD' (null per scope 'default') */
  date_from: string | null
  /** 'YYYY-MM-DD' (null per scope 'default') */
  date_to: string | null
  increment_intensity: number
  base_intensity: number
  is_active?: boolean
  /** opzionale: per tie-break deterministico (ISO timestamp) */
  updated_at?: string | null
}

export interface ResolvedKIntensity {
  incrementIntensity: number
  baseIntensity: number
  /** da dove viene il valore risolto (diagnostica/anteprima UI) */
  source: "day" | "period" | "default" | "global"
}

/** Clampa nei limiti di sicurezza. */
function clampIntensities(inc: number, base: number): { inc: number; base: number } {
  const safeInc = Number.isFinite(inc) ? Math.min(Math.max(inc, 0), K_INTENSITY_INCREMENT_CAP) : K_INTENSITY_GLOBAL_FALLBACK
  const safeBase = Number.isFinite(base) ? Math.min(Math.max(base, 0), K_INTENSITY_BASE_CAP) : K_BASE_INTENSITY_GLOBAL_FALLBACK
  return { inc: safeInc, base: safeBase }
}

/** True se la data ('YYYY-MM-DD') è coperta dalla regola. */
function ruleCoversDate(rule: KIntensityRule, dateStr: string): boolean {
  if (rule.scope === "default") return true
  if (!rule.date_from || !rule.date_to) return false
  // Confronto lessicografico: valido per il formato ISO 'YYYY-MM-DD'.
  return dateStr >= rule.date_from && dateStr <= rule.date_to
}

/** Tie-break: regola più recente (updated_at) prima; fallback: intervallo più stretto. */
function moreSpecificFirst(a: KIntensityRule, b: KIntensityRule): number {
  if (a.updated_at && b.updated_at && a.updated_at !== b.updated_at) {
    return a.updated_at > b.updated_at ? -1 : 1
  }
  const span = (r: KIntensityRule) =>
    r.date_from && r.date_to
      ? new Date(r.date_to).getTime() - new Date(r.date_from).getTime()
      : Number.MAX_SAFE_INTEGER
  return span(a) - span(b)
}

/**
 * Risolve le intensità K per una data specifica.
 * @param rules regole dell'hotel (già filtrate per hotel, possono includere inattive)
 * @param dateStr data target in formato 'YYYY-MM-DD'
 */
export function resolveKIntensity(
  rules: KIntensityRule[] | null | undefined,
  dateStr: string,
): ResolvedKIntensity {
  const active = (rules || []).filter((r) => r.is_active !== false)

  // 1. day
  const days = active.filter((r) => r.scope === "day" && ruleCoversDate(r, dateStr)).sort(moreSpecificFirst)
  if (days.length > 0) {
    const { inc, base } = clampIntensities(days[0].increment_intensity, days[0].base_intensity)
    return { incrementIntensity: inc, baseIntensity: base, source: "day" }
  }

  // 2. period
  const periods = active.filter((r) => r.scope === "period" && ruleCoversDate(r, dateStr)).sort(moreSpecificFirst)
  if (periods.length > 0) {
    const { inc, base } = clampIntensities(periods[0].increment_intensity, periods[0].base_intensity)
    return { incrementIntensity: inc, baseIntensity: base, source: "period" }
  }

  // 3. default hotel
  const def = active.find((r) => r.scope === "default")
  if (def) {
    const { inc, base } = clampIntensities(def.increment_intensity, def.base_intensity)
    return { incrementIntensity: inc, baseIntensity: base, source: "default" }
  }

  // 4. fallback globale (motore storico)
  return {
    incrementIntensity: K_INTENSITY_GLOBAL_FALLBACK,
    baseIntensity: K_BASE_INTENSITY_GLOBAL_FALLBACK,
    source: "global",
  }
}
