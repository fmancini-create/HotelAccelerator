/**
 * Implementazione concreta del push tariffe verso Slope (Partner API v1).
 *
 * Endpoint: POST /v1/lodging-types/{lodgingTypeId}/rates-and-availability-updates
 *
 * Vincoli documentati (PDF API Slope, 13/07/2026) + ESITO CERTIFICAZIONE
 * (feedback Slope, 22/07/2026 — due fix obbligatori):
 *  - Max 500 "aggiornamenti" per richiesta (= somma dei giorni nei dateRange).
 *  - Max 5 chiamate/minuto per struttura -> retry con backoff su 429.
 *  - dateRange: start ed end sono ENTRAMBI INCLUSIVI. La certificazione e'
 *    fallita perche' assumevamo end esclusivo (end = giorno+1): inviando il
 *    1/8 Slope scriveva 1/8 E 2/8. Per un singolo giorno: start = end = giorno.
 *  - Occupazioni: Slope ESIGE rates con ESATTAMENTE maximumCapacity elementi
 *    (occ 1..maxCap), altrimenti 400 invalid.data "This field must have a
 *    number of elements equal to the lodging maximum capacity" (visto live
 *    all'attivazione autopilot Superlusso, 22/07/2026). Il rilievo della
 *    certificazione NON era l'inviarle tutte, ma il CLONARE il prezzo
 *    dell'occupazione selezionata sulle altre: le occupazioni non incluse
 *    nella selezione vanno completate con i loro PREZZI REALI correnti
 *    (pricing_grid, fallback last_sent_prices) cosi' per Slope risultano
 *    invariate. Il clone dell'occupazione piu' vicina resta solo come
 *    extrema ratio (con warning). MAI mandare 0 (0.0 = "non in vendita").
 *    La capacity di riferimento e' la maximumCapacity della lodging type
 *    LATO SLOPE (GET /v1/lodging-types), non il nostro max_occupancy.
 *  - Niente push su rate plan DERIVATI (isDerived=true): vanno filtrati a
 *    monte nel mapping; qui difendiamo comunque con warning.
 *  - L'aggiornamento e' processato in modo ASINCRONO (202 Accepted).
 *
 * Non chiamare direttamente: passa attraverso slopeConnector.pushRates.
 */

import { SlopeClient } from "./client"
import type { PriceChange } from "@/lib/pricing/calculate-suggested-price"
import type {
  PMSIntegration,
  PushResult,
  RateMapping,
  RoomTypeMapping,
} from "../connector"

/** Prezzi per un singolo giorno: occupancy -> prezzo. */
type DayPrices = Map<number, number>

export async function pushViaSlope(
  pms: PMSIntegration,
  changes: PriceChange[],
  roomTypeMappings: RoomTypeMapping[],
  rateMappings: RateMapping[],
): Promise<PushResult> {
  console.log(`[v0] [pushViaSlope] Starting Slope push for ${changes.length} changes`)

  if (!pms.api_key) {
    return {
      success: false,
      method: "slope_api",
      cellsOrRecords: 0,
      errors: ["Configurazione Slope incompleta: api_key mancante"],
    }
  }

  const client = new SlopeClient({
    apiKey: pms.api_key,
    baseUrl: pms.endpoint_url || "",
  })

  const errors: string[] = []
  const warnings: string[] = []

  // ---- 1) Raggruppa i change per (lodgingType, ratePlan, date) ----
  // groups: lodgingTypeId -> ratePlanId -> date -> (occupancy -> price)
  const groups = new Map<string, Map<string, Map<string, DayPrices>>>()
  // Meta per completare le occupazioni mancanti: chiave "lodgingId|ratePlanId"
  // -> id interni (per query pricing_grid/last_sent) e max_occupancy nostro.
  const cellMeta = new Map<string, { roomTypeId: string; rateId: string; maxOcc: number | null }>()

  for (const change of changes) {
    const rt = roomTypeMappings.find((r) => r.id === change.roomTypeId)
    const lodgingTypeId = (rt as Record<string, unknown> | undefined)?.slope_lodging_type_id as
      | string
      | null
      | undefined
    if (!rt || !lodgingTypeId) {
      errors.push(
        `Room type ${change.roomTypeName} (id=${change.roomTypeId}) non ha slope_lodging_type_id mappato`,
      )
      continue
    }

    const rate = rateMappings.find((r) => r.id === change.rateId)
    const ratePlanId = (rate as Record<string, unknown> | undefined)?.slope_rate_plan_id as
      | string
      | null
      | undefined
    if (!rate || !ratePlanId) {
      errors.push(`Rate ${change.rateId} non ha slope_rate_plan_id mappato`)
      continue
    }

    if (typeof change.occupancy !== "number" || change.occupancy < 1) continue
    if (!Number.isFinite(change.suggestedPrice) || change.suggestedPrice <= 0) {
      // MAI mandare 0: su Slope 0.0 = "non in vendita" (chiusura occupazione).
      warnings.push(
        `Prezzo non valido (${change.suggestedPrice}) per ${change.roomTypeName} ${change.date} occ ${change.occupancy}: saltato`,
      )
      continue
    }

    const maxOcc = rt.max_occupancy ?? null
    if (maxOcc !== null && change.occupancy > maxOcc) continue

    let byRate = groups.get(lodgingTypeId)
    if (!byRate) groups.set(lodgingTypeId, (byRate = new Map()))
    let byDate = byRate.get(ratePlanId)
    if (!byDate) byRate.set(ratePlanId, (byDate = new Map()))
    let dayPrices = byDate.get(change.date)
    if (!dayPrices) byDate.set(change.date, (dayPrices = new Map()))
    dayPrices.set(change.occupancy, change.suggestedPrice)
    cellMeta.set(`${lodgingTypeId}|${ratePlanId}`, {
      roomTypeId: change.roomTypeId,
      rateId: change.rateId,
      maxOcc,
    })
  }

  // ---- 1b) Completa le occupazioni mancanti fino a maximumCapacity ----
  // Slope rifiuta con 400 rates che non coprano occ 1..maximumCapacity della
  // lodging type. Le occupazioni non selezionate vengono completate con i
  // PREZZI REALI correnti (pricing_grid -> last_sent_prices -> clone nearest
  // come extrema ratio), cosi' per Slope risultano invariate.
  if (groups.size > 0) {
    await fillMissingOccupancies(client, groups, cellMeta, warnings, errors)
  }

  // ---- 2) Costruisce le richieste per lodging type ----
  let totalDays = 0
  const requests: {
    lodgingTypeId: string
    rateUpdates: {
      dateRange: { start: string; end: string }
      ratePlanId: string
      rates: { occupancy: number; rate: number }[]
    }[]
  }[] = []

  for (const [lodgingTypeId, byRate] of groups) {
    const rateUpdates: (typeof requests)[number]["rateUpdates"] = []

    for (const [ratePlanId, byDate] of byRate) {
      // Consolida giorni CONSECUTIVI con lo stesso set di prezzi in un unico
      // dateRange (il limite di 500 updates conta i GIORNI, non le richieste).
      const dates = [...byDate.keys()].sort()
      let i = 0
      while (i < dates.length) {
        const startDate = dates[i]
        const startPrices = toRates(byDate.get(startDate)!)
        let j = i
        while (
          j + 1 < dates.length &&
          isNextDay(dates[j], dates[j + 1]) &&
          samePrices(startPrices, toRates(byDate.get(dates[j + 1])!))
        ) {
          j++
        }
        // FIX certificazione 22/07/2026: il dateRange Slope e' INCLUSIVO su
        // entrambi gli estremi (end = ultimo giorno, NON giorno+1). Con
        // l'end esclusivo il push di un singolo giorno scriveva anche il
        // giorno successivo (es. 1/8 -> scritti 1/8 e 2/8).
        rateUpdates.push({
          dateRange: { start: startDate, end: dates[j] },
          ratePlanId,
          rates: startPrices,
        })
        totalDays += j - i + 1
        i = j + 1
      }
    }

    if (rateUpdates.length > 0) requests.push({ lodgingTypeId, rateUpdates })
  }

  if (requests.length === 0) {
    return {
      success: errors.length === 0,
      method: "slope_api",
      cellsOrRecords: 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  // ---- 3) Invia (chunk da max 500 giorni, retry su 429: 5 req/min) ----
  let sent = 0
  for (const req of requests) {
    // Spezza rateUpdates in chunk che non superino 500 giorni totali.
    const chunks: (typeof req.rateUpdates)[] = []
    let current: typeof req.rateUpdates = []
    let currentDays = 0
    for (const ru of req.rateUpdates) {
      const days = daysInRange(ru.dateRange.start, ru.dateRange.end)
      if (currentDays + days > 500 && current.length > 0) {
        chunks.push(current)
        current = []
        currentDays = 0
      }
      current.push(ru)
      currentDays += days
    }
    if (current.length > 0) chunks.push(current)

    for (const chunk of chunks) {
      try {
        // ATTENZIONE (verificato live in sandbox 13/07/2026): Slope valida
        // `rates[].rate` come Money STRINGA a 2 decimali ("150.00").
        // Un numero JSON (150 o 150.0) viene rifiutato con 400 invalid.data.
        const serialized = chunk.map((ru) => ({
          dateRange: ru.dateRange,
          ratePlanId: ru.ratePlanId,
          rates: ru.rates.map((r) => ({
            occupancy: r.occupancy,
            rate: r.rate.toFixed(2),
          })),
        }))
        await client.postRatesAndAvailabilityUpdates(req.lodgingTypeId, { rateUpdates: serialized })
        sent += chunk.reduce((s, ru) => s + daysInRange(ru.dateRange.start, ru.dateRange.end), 0)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`Push fallito per lodging ${req.lodgingTypeId}: ${msg}`)
        console.error(`[v0] [pushViaSlope] chunk failed for ${req.lodgingTypeId}: ${msg}`)
      }
    }
  }

  console.log(
    `[v0] [pushViaSlope] Done: ${sent}/${totalDays} day-updates sent, ${errors.length} errors, ${warnings.length} warnings`,
  )

  return {
    success: errors.length === 0 && sent > 0,
    method: "slope_api",
    cellsOrRecords: sent,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

/**
 * Completa ogni cella (lodging/rate/giorno) fino a occ 1..maximumCapacity
 * della lodging type SLOPE. Fonti in ordine di preferenza per le occupazioni
 * mancanti: pricing_grid (prezzo corrente reale) -> last_sent_prices (ultimo
 * inviato) -> clone dell'occupazione piu' vicina (extrema ratio, warning).
 */
async function fillMissingOccupancies(
  client: SlopeClient,
  groups: Map<string, Map<string, Map<string, DayPrices>>>,
  cellMeta: Map<string, { roomTypeId: string; rateId: string; maxOcc: number | null }>,
  warnings: string[],
  errors: string[],
): Promise<void> {
  // Capacity di riferimento: maximumCapacity LATO SLOPE (l'errore 400 usa
  // quella). Fallback: max_occupancy del nostro mapping.
  const slopeCapacity = new Map<string, number>()
  try {
    const lodgingTypes = await client.getLodgingTypes()
    for (const lt of lodgingTypes) {
      if (typeof lt.maximumCapacity === "number" && lt.maximumCapacity > 0) {
        slopeCapacity.set(lt.id, lt.maximumCapacity)
      }
    }
  } catch (e) {
    warnings.push(
      `Impossibile leggere maximumCapacity da Slope (${e instanceof Error ? e.message : String(e)}): uso il max_occupancy del mapping`,
    )
  }

  // Individua le celle incomplete raggruppate per (roomTypeId, rateId).
  type Missing = { dayPrices: DayPrices; date: string; occs: number[] }
  const byPair = new Map<string, { roomTypeId: string; rateId: string; cells: Missing[] }>()

  for (const [lodgingTypeId, byRate] of groups) {
    for (const [ratePlanId, byDate] of byRate) {
      const meta = cellMeta.get(`${lodgingTypeId}|${ratePlanId}`)
      if (!meta) continue
      const cap = slopeCapacity.get(lodgingTypeId) ?? meta.maxOcc ?? 0
      if (cap <= 0) continue
      for (const [date, dayPrices] of byDate) {
        const missing: number[] = []
        for (let occ = 1; occ <= cap; occ++) {
          if (!dayPrices.has(occ)) missing.push(occ)
        }
        if (missing.length === 0) continue
        const key = `${meta.roomTypeId}|${meta.rateId}`
        let entry = byPair.get(key)
        if (!entry) byPair.set(key, (entry = { roomTypeId: meta.roomTypeId, rateId: meta.rateId, cells: [] }))
        entry.cells.push({ dayPrices, date, occs: missing })
      }
    }
  }
  if (byPair.size === 0) return

  // Prezzi reali dal DB (service role: siamo in un flusso server-side).
  const { createServiceRoleClient } = await import("@/lib/supabase/direct")
  const supabase = await createServiceRoleClient()

  for (const { roomTypeId, rateId, cells } of byPair.values()) {
    const dates = [...new Set(cells.map((c) => c.date))]
    const [{ data: gridRows }, { data: sentRows }] = await Promise.all([
      supabase
        .from("pricing_grid")
        .select("date, occupancy, price")
        .eq("room_type_id", roomTypeId)
        .eq("rate_id", rateId)
        .in("date", dates),
      supabase
        .from("last_sent_prices")
        .select("target_date, occupancy, last_price")
        .eq("room_type_id", roomTypeId)
        .eq("rate_id", rateId)
        .in("target_date", dates),
    ])

    const lookup = new Map<string, number>() // "date|occ" -> price
    // last_sent prima, grid dopo: il grid (prezzo corrente) vince.
    for (const r of sentRows ?? []) {
      const p = Number(r.last_price)
      if (Number.isFinite(p) && p > 0) lookup.set(`${r.target_date}|${r.occupancy}`, p)
    }
    for (const r of gridRows ?? []) {
      const p = Number(r.price)
      if (Number.isFinite(p) && p > 0) lookup.set(`${r.date}|${r.occupancy}`, p)
    }

    for (const cell of cells) {
      const stillMissing: number[] = []
      for (const occ of cell.occs) {
        const p = lookup.get(`${cell.date}|${occ}`)
        if (p !== undefined) {
          cell.dayPrices.set(occ, p)
        } else {
          stillMissing.push(occ)
        }
      }
      // Extrema ratio: clone dell'occupazione piu' vicina (MAI 0), con warning.
      if (stillMissing.length > 0) {
        const available = [...cell.dayPrices.keys()].sort((a, b) => a - b)
        if (available.length === 0) {
          errors.push(`Nessun prezzo disponibile per room ${roomTypeId} rate ${rateId} ${cell.date}`)
          continue
        }
        for (const occ of stillMissing) {
          const nearest = available.reduce((best, o) => (Math.abs(o - occ) < Math.abs(best - occ) ? o : best))
          cell.dayPrices.set(occ, cell.dayPrices.get(nearest)!)
        }
        warnings.push(
          `${cell.date}: occ ${stillMissing.join(",")} senza prezzo in grid/ultimo-inviato, clonato il prezzo dell'occupazione piu' vicina (Slope richiede occ 1..maxCapacity)`,
        )
      }
    }
  }
}

/**
 * Converte i prezzi del giorno nel payload rates, ordinati per occupazione
 * crescente (dopo il completamento 1..maximumCapacity di fillMissingOccupancies).
 */
function toRates(dayPrices: DayPrices): { occupancy: number; rate: number }[] {
  return [...dayPrices.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([occupancy, rate]) => ({ occupancy, rate: round2(rate) }))
}

function samePrices(
  a: { occupancy: number; rate: number }[],
  b: { occupancy: number; rate: number }[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].occupancy !== b[i].occupancy || a[i].rate !== b[i].rate) return false
  }
  return true
}

function isNextDay(a: string, b: string): boolean {
  return addDays(a, 1) === b
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Giorni in un dateRange Slope con estremi ENTRAMBI INCLUSIVI (min 1). */
function daysInRange(start: string, endInclusive: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime()
  const e = new Date(`${endInclusive}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
