export interface VoiceRateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Salvaguardia per istanza contro loop o script 3CX mal configurati.
 *
 * In serverless non sostituisce un limite distribuito a monte, ma evita che una
 * singola istanza calda moltiplichi senza controllo chiamate AI costose.
 */
export function createVoiceRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, { startedAt: number; count: number }>()

  return (key: string, now = Date.now()): VoiceRateLimitResult => {
    const current = buckets.get(key)
    if (!current || now - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 })
      return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 }
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000)),
      }
    }

    current.count += 1
    return { allowed: true, remaining: Math.max(0, limit - current.count), retryAfterSeconds: 0 }
  }
}

/** 90 turni/minuto per tenant: ampio per le chiamate reali, stretto per un loop. */
export const takeVoiceRequest = createVoiceRateLimiter(90, 60_000)
