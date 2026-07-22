/**
 * K-variable weight override resolver
 *
 * 13/05/2026: oltre al peso base (default_weight) ogni variabile puo' avere N
 * override temporali con range data + opzionale filtro giorni-della-settimana.
 * Esempi reali:
 *   - "Sabato d'inverno" -> range 01/12 -> 28/02, DOW=[6] (sabato), weight=8
 *   - "Vinitaly 2026" -> range 12/04 -> 16/04, DOW=null, weight=9
 *   - "Bassa stagione" -> range 15/01 -> 28/02, DOW=null, weight=2
 *
 * REGOLA DI RISOLUZIONE (per una data target):
 * 1. Filtra override attivi che coprono la data (date_from <= date <= date_to)
 * 2. Filtra per giorno settimana se days_of_week e' specificato (0=domenica)
 * 3. Ordina per priority DESC, poi created_at DESC (piu' recente prima)
 * 4. Vince il primo. Se nessuno, fallback su default_weight della variabile.
 *
 * Volutamente NON modifica l'engine: il bridge in recalculate-queued-prices.ts
 * popola PricingVariable.weight_by_date prima di passare al ctx. L'engine fa
 * lookup di 1 riga (con fallback su default_weight) ed e' l'unico cambio.
 *
 * Compatibilita': se non esiste alcun override per un hotel/variabile, il
 * comportamento e' IDENTICO a prima (default_weight fisso).
 */

export interface WeightOverrideRow {
  id: string
  hotel_id: string
  variable_id: string
  label: string
  date_from: string // YYYY-MM-DD
  date_to: string // YYYY-MM-DD
  days_of_week: number[] | null
  weight: number
  priority: number
  is_active: boolean
  created_at: string
}

/**
 * Genera la sequenza di date YYYY-MM-DD da `from` a `to` inclusi.
 * Usata internamente dal builder per espandere ogni override sul range.
 */
function* iterateDates(from: string, to: string): Generator<string> {
  const start = new Date(from + "T00:00:00Z")
  const end = new Date(to + "T00:00:00Z")
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().split("T")[0]
  }
}

/**
 * Costruisce la mappa { variable_id: { dateStr: weight } } per il range
 * [rangeStart, rangeEnd] dato l'elenco di override caricati per l'hotel.
 *
 * Solo le date davvero coperte da almeno un override vengono inserite. Per le
 * date senza override la variabile manterra' default_weight (fallback engine).
 *
 * Strategia tie-break: priority desc, created_at desc. Implementata pre-sorting
 * l'array e accettando il PRIMO match per (variable_id, date).
 */
export function buildWeightOverrideMap(
  overrides: WeightOverrideRow[],
  rangeStart: string,
  rangeEnd: string,
): Record<string, Record<string, number>> {
  // Pre-sort: priority desc, created_at desc → quando inseriamo nella mappa
  // diamo precedenza al primo che incontra una data ancora vuota.
  const sorted = [...overrides]
    .filter((o) => o.is_active !== false)
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      // ISO string ordering = chronological
      return b.created_at.localeCompare(a.created_at)
    })

  const map: Record<string, Record<string, number>> = {}
  const rangeStartDate = new Date(rangeStart + "T00:00:00Z")
  const rangeEndDate = new Date(rangeEnd + "T00:00:00Z")

  for (const o of sorted) {
    // Restringi il range dell'override al range richiesto: niente sprechi
    // su date che il caller non rendera' mai.
    const from = o.date_from > rangeStart ? o.date_from : rangeStart
    const to = o.date_to < rangeEnd ? o.date_to : rangeEnd
    if (from > to) continue

    const fromDate = new Date(from + "T00:00:00Z")
    const toDate = new Date(to + "T00:00:00Z")
    if (fromDate > rangeEndDate || toDate < rangeStartDate) continue

    const dowFilter = o.days_of_week && o.days_of_week.length > 0 ? o.days_of_week : null

    for (const dateStr of iterateDates(from, to)) {
      // Filtro giorno settimana opzionale
      if (dowFilter) {
        const dow = new Date(dateStr + "T00:00:00Z").getUTCDay() // 0=Sun..6=Sat
        if (!dowFilter.includes(dow)) continue
      }
      // Inserimento solo se non c'e' gia' un override (priorita' alta vince
      // grazie al pre-sort).
      if (!map[o.variable_id]) map[o.variable_id] = {}
      if (map[o.variable_id][dateStr] === undefined) {
        map[o.variable_id][dateStr] = o.weight
      }
    }
  }

  return map
}

/**
 * Helper di lookup puntuale per UI / preview / debug. Usa il map costruito
 * sopra. Restituisce undefined se non c'e' override.
 */
export function getOverriddenWeight(
  weightMap: Record<string, Record<string, number>> | undefined,
  variableId: string,
  dateStr: string,
): number | undefined {
  return weightMap?.[variableId]?.[dateStr]
}
