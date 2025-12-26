/**
 * Simple in-memory rate limiter for tenant isolation.
 *
 * NOTE: For production at scale (50+ tenants), replace with Redis-based rate limiting:
 * - Upstash Redis with @upstash/ratelimit
 * - Distributed rate limiting across serverless instances
 *
 * This implementation works for development and small deployments.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store (reset on cold starts - acceptable for basic protection)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries periodically
const CLEANUP_INTERVAL = 60000 // 1 minute
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return

  lastCleanup = now
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  limit: number
  /** Time window in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Check rate limit for a given identifier (usually propertyId or propertyId:userId)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 100, windowMs: 60000 },
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const key = identifier

  let entry = rateLimitStore.get(key)

  // Create new entry if doesn't exist or expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs,
    }
    rateLimitStore.set(key, entry)
  }

  // Increment count
  entry.count++

  const remaining = Math.max(0, config.limit - entry.count)
  const success = entry.count <= config.limit

  return {
    success,
    limit: config.limit,
    remaining,
    reset: entry.resetAt,
  }
}

/**
 * Rate limit configurations per endpoint type
 */
export const RATE_LIMITS = {
  // API reads - generous limit
  read: { limit: 200, windowMs: 60000 },

  // API writes - more restricted
  write: { limit: 50, windowMs: 60000 },

  // Auth endpoints - very restricted to prevent brute force
  auth: { limit: 10, windowMs: 60000 },

  // Email sending - restricted to prevent spam
  email: { limit: 20, windowMs: 60000 },

  // Public embed - generous but tracked
  embed: { limit: 500, windowMs: 60000 },

  // AI/Intelligence - expensive operations
  ai: { limit: 20, windowMs: 60000 },
} as const

/**
 * Helper to create rate limit headers for responses
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.reset.toString(),
  }
}

/**
 * Create a rate-limited response when limit exceeded
 */
export function rateLimitExceeded(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        ...rateLimitHeaders(result),
      },
    },
  )
}
