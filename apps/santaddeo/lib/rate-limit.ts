/**
 * Rate limiting con Upstash Redis (sliding window).
 * Fallback in-memory quando KV_REST_API_URL/TOKEN non sono configurati,
 * cosi' funziona anche in dev senza dipendenze esterne.
 *
 * NOTA: l'in-memory fallback NON e' affidabile su Vercel/serverless perche'
 * ogni Lambda invocation puo' atterrare su un'istanza diversa. Usalo solo
 * come degraded mode. In produzione serve sempre Upstash configurato.
 */

import { Redis } from "@upstash/redis"

let _redis: Redis | null = null
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  if (!_redis) {
    _redis = new Redis({ url, token })
  }
  return _redis
}

// In-memory fallback: { key -> { count, firstAttempt } }
const memoryStore = new Map<string, { count: number; firstAttempt: number }>()

/**
 * Cleanup periodico per evitare memory leak nell'in-memory store.
 * Esegue solo se l'in-memory e' usato.
 */
function cleanupMemoryStore(now: number, windowMs: number): void {
  if (memoryStore.size < 1000) return // cleanup solo quando cresce
  for (const [key, entry] of memoryStore.entries()) {
    if (now - entry.firstAttempt > windowMs) {
      memoryStore.delete(key)
    }
  }
}

export interface RateLimitOptions {
  /** Identificatore della classe di rate limit, es. "signup", "login_failed". */
  scope: string
  /** Identificatore del client (es. IP, user_id, email). */
  identifier: string
  /** Numero massimo di richieste permesse nella finestra. */
  max: number
  /** Durata della finestra in secondi. */
  windowSeconds: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  /** True se Upstash non e' configurato (in-memory fallback in uso). */
  degraded: boolean
}

/**
 * Verifica e incrementa un contatore di rate limit.
 * Ritorna `success: false` se il limite e' superato.
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { scope, identifier, max, windowSeconds } = opts
  const key = `ratelimit:${scope}:${identifier}`
  const windowMs = windowSeconds * 1000
  const now = Date.now()

  const redis = getRedis()
  if (redis) {
    try {
      // Pattern fixed-window con INCR + EXPIRE atomico
      // Sliding window richiederebbe Ratelimit di @upstash/ratelimit, qui
      // teniamo le dipendenze al minimo (gia' c'e' @upstash/redis).
      const count = await redis.incr(key)
      if (count === 1) {
        // Prima richiesta: setta scadenza
        await redis.expire(key, windowSeconds)
      }
      const ttl = await redis.ttl(key)
      const resetAt = ttl > 0 ? now + ttl * 1000 : now + windowMs
      const remaining = Math.max(0, max - count)
      return {
        success: count <= max,
        remaining,
        resetAt,
        degraded: false,
      }
    } catch (err) {
      console.warn("[rate-limit] Redis error, falling back to memory:", err instanceof Error ? err.message : err)
      // Cade in fallback in-memory sotto
    }
  }

  // ---- In-memory fallback ----
  cleanupMemoryStore(now, windowMs)
  const entry = memoryStore.get(key)
  if (!entry || now - entry.firstAttempt > windowMs) {
    memoryStore.set(key, { count: 1, firstAttempt: now })
    return { success: true, remaining: max - 1, resetAt: now + windowMs, degraded: true }
  }
  entry.count++
  const remaining = Math.max(0, max - entry.count)
  return {
    success: entry.count <= max,
    remaining,
    resetAt: entry.firstAttempt + windowMs,
    degraded: true,
  }
}
