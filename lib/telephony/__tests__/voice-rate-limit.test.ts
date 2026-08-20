import { describe, expect, it } from "vitest"
import { createVoiceRateLimiter } from "@/lib/telephony/voice-rate-limit"

describe("limite richieste voce", () => {
  it("blocca oltre la soglia e riparte nella finestra successiva", () => {
    const take = createVoiceRateLimiter(2, 1_000)
    expect(take("tenant", 0).allowed).toBe(true)
    expect(take("tenant", 100).allowed).toBe(true)
    expect(take("tenant", 200)).toMatchObject({ allowed: false, retryAfterSeconds: 1 })
    expect(take("tenant", 1_000)).toMatchObject({ allowed: true, remaining: 1 })
  })

  it("mantiene contatori separati per tenant", () => {
    const take = createVoiceRateLimiter(1, 1_000)
    expect(take("a", 0).allowed).toBe(true)
    expect(take("a", 1).allowed).toBe(false)
    expect(take("b", 1).allowed).toBe(true)
  })
})
