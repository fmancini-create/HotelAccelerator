import { Redis } from "@upstash/redis"

// Singleton Redis client
let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  }
  return redis
}

/**
 * Cache TTL presets (in seconds)
 */
export const CacheTTL = {
  /** Dashboard metrics - changes on sync, not on page load (5 min) */
  METRICS: 300,
  /** Production data - changes on sync (5 min) */
  PRODUCTION: 300,
  /** Channel production - changes on sync (5 min) */
  CHANNEL_PRODUCTION: 300,
  /** Availability data - changes on sync (3 min) */
  AVAILABILITY: 180,
  /** Hotel info - rarely changes (30 min) */
  HOTEL_INFO: 1800,
  /** Room types - rarely changes (30 min) */
  ROOM_TYPES: 1800,
} as const

/**
 * Build a namespaced cache key
 */
export function cacheKey(
  namespace: string,
  hotelId: string,
  ...parts: string[]
): string {
  return `santaddeo:${namespace}:${hotelId}:${parts.join(":")}`
}

/**
 * Get a cached value, or compute and cache it
 * 
 * @param key - Cache key
 * @param ttlSeconds - Time to live in seconds
 * @param computeFn - Function to compute the value if not cached
 * @returns The cached or computed value
 */
export async function cachedQuery<T>(
  key: string,
  ttlSeconds: number,
  computeFn: () => Promise<T>
): Promise<T> {
  const r = getRedis()

  try {
    // Try to get from cache
    const cached = await r.get<T>(key)
    if (cached !== null && cached !== undefined) {
      return cached
    }
  } catch (err) {
    // Redis down? Fall through to compute
    console.error("[Cache] Redis GET error, falling through:", err)
  }

  // Compute fresh value
  const value = await computeFn()

  try {
    // Cache the result (fire-and-forget, don't block response)
    await r.set(key, value, { ex: ttlSeconds })
  } catch (err) {
    console.error("[Cache] Redis SET error:", err)
  }

  return value
}

/**
 * Invalidate all cache keys matching a pattern for a hotel
 * Called after sync completes for a hotel
 */
export async function invalidateHotelCache(hotelId: string): Promise<void> {
  const r = getRedis()
  const namespaces = [
    "metrics",
    "production",
    "channel-production",
    "availability",
    "hotel-info",
  ]

  try {
    // Delete known keys for all common period combinations
    const periods = ["mtd", "ytd", "last30", "last90", "last365", "custom"]
    const keysToDelete: string[] = []

    for (const ns of namespaces) {
      // Delete all period-based keys
      for (const period of periods) {
        keysToDelete.push(`santaddeo:${ns}:${hotelId}:${period}`)
      }
      // Also delete keys with month-based patterns (production uses month)
      // We use a scan to find these
    }

    if (keysToDelete.length > 0) {
      await r.del(...keysToDelete)
    }

    // Scan and delete any remaining keys for this hotel
    let cursor = 0
    do {
      const [nextCursor, keys] = await r.scan(cursor, {
        match: `santaddeo:*:${hotelId}:*`,
        count: 100,
      })
      cursor = Number(nextCursor)
      if (keys.length > 0) {
        await r.del(...keys)
      }
    } while (cursor !== 0)
  } catch (err) {
    console.error("[Cache] Invalidation error for hotel", hotelId, err)
  }
}

/**
 * Invalidate ALL cached data (admin operation)
 */
export async function invalidateAllCache(): Promise<number> {
  const r = getRedis()
  let deleted = 0

  try {
    let cursor = 0
    do {
      const [nextCursor, keys] = await r.scan(cursor, {
        match: "santaddeo:*",
        count: 100,
      })
      cursor = Number(nextCursor)
      if (keys.length > 0) {
        await r.del(...keys)
        deleted += keys.length
      }
    } while (cursor !== 0)
  } catch (err) {
    console.error("[Cache] Full invalidation error:", err)
  }

  return deleted
}
