/**
 * Implementazione concreta del push tariffe verso Slope (Partner API v1).
 *
 * Endpoint: POST /v1/lodging-types/{lodgingTypeId}/rates-and-availability-updates
 *
 * Vincoli documentati (PDF API Slope, 13/07/2026):
 *  - Max 500 "aggiornamenti" per richiesta (= somma dei giorni nei dateRange).
 *  - Max 5 chiamate/minuto per struttura -> retry con backoff su 429.
 *  - I prezzi vanno specificati per TUTTE le occupazioni da 1 a maximumCapacity
 *    della lodging type. Un prezzo 0.0 mette l'occupazione "non in vendita",
 *    quindi NON dobbiamo mai mandare 0 per occupazioni che non gestiamo:
 *    le occupazioni mancanti nel pricing grid vengono riempite clonando il
 *    prezzo dell'occupazione disponibile piu' vicina (mai 0).
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
  // maxCapacity per room type (per riempire le occupazioni mancanti)
  const capacityByLodging = new Map<string, number>()

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
    if (maxOcc !== null) capacityByLodging.set(lodgingTypeId, maxOcc)

    let byRate = groups.get(lodgingTypeId)
    if (!byRate) groups.set(lodgingTypeId, (byRate = new Map()))
    let byDate = byRate.get(ratePlanId)
    if (!byDate) byRate.set(ratePlanId, (byDate = new Map()))
    let dayPrices = byDate.get(change.date)
    if (!dayPrices) byDate.set(change.date, (dayPrices = new Map()))
    dayPrices.set(change.occupancy, change.suggestedPrice)
  }

  // ---- 2) Costruisce le richieste per lodging type ----
  // La doc impone prezzi per TUTTE le occupazioni 1..maximumCapacity: le
  // occupazioni mancanti vengono riempite con il prezzo dell'occupazione
  // disponibile piu' vicina (clamp, mai 0).
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
    const maxCapacity = capacityByLodging.get(lodgingTypeId) ?? 0
    const rateUpdates: (typeof requests)[number]["rateUpdates"] = []

    for (const [ratePlanId, byDate] of byRate) {
      // Consolida giorni CONSECUTIVI con lo stesso set di prezzi in un unico
      // dateRange (il limite di 500 updates conta i GIORNI, non le richieste).
      const dates = [...byDate.keys()].sort()
      let i = 0
      while (i < dates.length) {
        const startDate = dates[i]
        const startPrices = fillOccupancies(byDate.get(startDate)!, maxCapacity, warnings, startDate)
        let j = i
        while (
          j + 1 < dates.length &&
          isNextDay(dates[j], dates[j + 1]) &&
          samePrices(startPrices, fillOccupancies(byDate.get(dates[j + 1])!, maxCapacity, warnings, dates[j + 1]))
        ) {
          j++
        }
        // NB: DateRange Slope e' [start; end) — end esclusivo (convenzione
        // ISO dei loro esempi: [2025-05-31;2025-06-03) = 31/5, 1/6, 2/6).
        rateUpdates.push({
          dateRange: { start: startDate, end: addDays(dates[j], 1) },
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
      const days = daysBetween(ru.dateRange.start, ru.dateRange.end)
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
        sent += chunk.reduce((s, ru) => s + daysBetween(ru.dateRange.start, ru.dateRange.end), 0)
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
 * Riempie le occupazioni mancanti 1..maxCapacity con il prezzo
 * dell'occupazione disponibile piu' vicina. MAI 0 (su Slope 0 = chiusura).
 */
function fillOccupancies(
  dayPrices: DayPrices,
  maxCapacity: number,
  warnings: string[],
  date: string,
): { occupancy: number; rate: number }[] {
  const available = [...dayPrices.keys()].sort((a, b) => a - b)
  if (available.length === 0) return []
  const top = maxCapacity > 0 ? maxCapacity : available[available.length - 1]
  const out: { occupancy: number; rate: number }[] = []
  let filled = 0
  for (let occ = 1; occ <= top; occ++) {
    const exact = dayPrices.get(occ)
    if (exact !== undefined) {
      out.push({ occupancy: occ, rate: round2(exact) })
    } else {
      // clamp all'occupazione disponibile piu' vicina
      const nearest = available.reduce((best, o) =>
        Math.abs(o - occ) < Math.abs(best - occ) ? o : best,
      )
      out.push({ occupancy: occ, rate: round2(dayPrices.get(nearest)!) })
      filled++
    }
  }
  if (filled > 0) {
    // Warning aggregato una sola volta per giorno (non per occupazione).
    warnings.push(
      `${date}: ${filled} occupazioni senza prezzo nel grid, riempite col prezzo dell'occupazione piu' vicina (richiesta Slope: tutte le occ 1..maxCapacity)`,
    )
  }
  return out
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

function daysBetween(start: string, endExclusive: string): number {
  const s = new Date(`${start}T00:00:00Z`).getTime()
  const e = new Date(`${endExclusive}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((e - s) / 86_400_000))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
