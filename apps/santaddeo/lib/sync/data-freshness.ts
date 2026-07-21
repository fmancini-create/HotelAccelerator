/**
 * Data freshness tracking (12/05/2026 sera tardi)
 *
 * Tracker tecnico, visibile da /api/dati/freshness. Storage Redis:
 *   key:   santaddeo:freshness:{hotelId}:{type}
 *   value: ISO timestamp dell'ultimo sync completato
 *   TTL:   7 giorni (auto-pulizia)
 *
 * Usato per:
 *  - dashboard tecnico /superadmin/freshness
 *  - warning [availability-stale] quando l'eta' supera la soglia
 *  - debug "perche' il pricing usa availability vecchia?"
 *
 * NON e' source-of-truth. E' solo un indicatore osservazionale. Il pricing
 * NON viene bloccato da freshness stale (regola architetturale).
 */

import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

export type FreshnessType =
  | "bookings"
  | "availability"
  | "pricing"
  | "rates"
  | "production"

const KEY_PREFIX = "santaddeo:freshness:"
const TTL_SECONDS = 7 * 24 * 60 * 60 // 7 giorni

export interface FreshnessSnapshot {
  hotel_id: string
  bookings_last_sync?: string
  bookings_age_minutes?: number
  availability_last_sync?: string
  availability_age_minutes?: number
  pricing_last_sync?: string
  pricing_age_minutes?: number
  rates_last_sync?: string
  rates_age_minutes?: number
  production_last_sync?: string
  production_age_minutes?: number
}

function buildKey(hotelId: string, type: FreshnessType): string {
  return `${KEY_PREFIX}${hotelId}:${type}`
}

/**
 * Marca un sync completato per (hotel, type). Best-effort, errori non rilanciati.
 */
export async function markSyncCompleted(
  hotelId: string,
  type: FreshnessType
): Promise<void> {
  try {
    const key = buildKey(hotelId, type)
    const value = new Date().toISOString()
    await redis.set(key, value, { ex: TTL_SECONDS })
  } catch (err) {
    console.warn(`[freshness] markSyncCompleted ${type} failed:`, err)
  }
}

/**
 * Ritorna snapshot freshness per quell'hotel. Tutti i campi sono opzionali:
 * se mancano significa che non e' mai stato registrato un sync per quel type
 * dall'introduzione del tracker (12/05/2026). NON significa che il dato non
 * esiste in DB.
 */
export async function getDataFreshness(
  hotelId: string
): Promise<FreshnessSnapshot> {
  const types: FreshnessType[] = [
    "bookings",
    "availability",
    "pricing",
    "rates",
    "production",
  ]

  const snapshot: FreshnessSnapshot = { hotel_id: hotelId }

  try {
    const keys = types.map((t) => buildKey(hotelId, t))
    const values = await redis.mget(...keys)
    const now = Date.now()

    types.forEach((type, idx) => {
      const v = values[idx] as string | null
      if (v) {
        const ts = new Date(v).getTime()
        if (!isNaN(ts)) {
          const ageMin = Math.floor((now - ts) / 60000)
          ;(snapshot as any)[`${type}_last_sync`] = v
          ;(snapshot as any)[`${type}_age_minutes`] = ageMin
        }
      }
    })
  } catch (err) {
    console.warn(`[freshness] getDataFreshness failed:`, err)
  }

  return snapshot
}

/**
 * Boolean utility: e' stale rispetto alla soglia?
 * Se non c'e' record, ritorna `null` (non sappiamo): il caller decide la
 * politica conservativa.
 */
export async function isStale(
  hotelId: string,
  type: FreshnessType,
  thresholdMinutes: number
): Promise<boolean | null> {
  try {
    const key = buildKey(hotelId, type)
    const v = await redis.get<string>(key)
    if (!v) return null
    const ts = new Date(v).getTime()
    if (isNaN(ts)) return null
    const ageMin = Math.floor((Date.now() - ts) / 60000)
    return ageMin > thresholdMinutes
  } catch {
    return null
  }
}
