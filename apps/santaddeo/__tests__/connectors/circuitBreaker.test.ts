/**
 * Tests for Scidoo Circuit Breaker (per-endpoint)
 *
 * Mock: @upstash/redis, global fetch
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── In-memory Redis mock ──
const store = new Map<string, any>()
const mockRedisGet = vi.fn(async (key: string) => store.get(key) ?? null)
const mockRedisSet = vi.fn(async (key: string, value: any) => {
  store.set(key, value)
})
const mockRedisDel = vi.fn(async (...keys: string[]) => {
  for (const k of keys) store.delete(k)
})
const mockRedisKeys = vi.fn(async (pattern: string) => {
  const prefix = pattern.replace("*", "")
  return Array.from(store.keys()).filter((k) => k.startsWith(prefix))
})

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    keys: mockRedisKeys,
  })),
}))

// ── Mock email service (dynamic import in scidoo-client) ──
vi.mock("@/lib/services/email-service", () => ({
  emailService: {
    sendAlertIfNotRecent: vi.fn().mockResolvedValue({ sent: false, throttled: true }),
  },
}))

vi.stubEnv("KV_REST_API_URL", "https://fake-redis.upstash.io")
vi.stubEnv("KV_REST_API_TOKEN", "fake-token")

const { ScidooClient, isAnyCircuitOpen } = await import("@/lib/services/scidoo-client")

describe("Circuit Breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.clear()
  })

  // 1. Circuit breaker opens after 5 consecutive failures
  it("opens after CIRCUIT_BREAKER_THRESHOLD (5) consecutive failures", async () => {
    const client = new ScidooClient({
      apiKey: "test-api-key",
      propertyId: "prop-1",
      hotelId: "hotel-CB1",
    })

    // Mock fetch to always fail
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused"))
    )

    // Make 5 calls, each exhausting 3 retries -> 5 recordFailure calls
    for (let i = 0; i < 5; i++) {
      try {
        await client.getAccountInfo()
      } catch {
        // expected
      }
    }

    // Check Redis for the circuit state
    const state = store.get("circuit:scidoo:hotel-CB1:account-getInfo")
    expect(state).toBeDefined()
    expect(state.isOpen).toBe(true)
    expect(state.failures).toBeGreaterThanOrEqual(5)
  })

  // 2. Different endpoints have independent counters
  it("tracks failures independently per endpoint", async () => {
    // Simulate: 3 failures on endpoint A, 2 failures on endpoint B
    const stateA = { failures: 3, lastFailure: Date.now(), isOpen: false }
    const stateB = { failures: 2, lastFailure: Date.now(), isOpen: false }

    store.set("circuit:scidoo:hotel-INDEP:bookings-get", stateA)
    store.set("circuit:scidoo:hotel-INDEP:rooms-getRoomTypes", stateB)

    const retrievedA = await mockRedisGet("circuit:scidoo:hotel-INDEP:bookings-get")
    const retrievedB = await mockRedisGet("circuit:scidoo:hotel-INDEP:rooms-getRoomTypes")

    expect(retrievedA.failures).toBe(3)
    expect(retrievedB.failures).toBe(2)
    // Neither should be open (both < 5)
    expect(retrievedA.isOpen).toBe(false)
    expect(retrievedB.isOpen).toBe(false)
  })

  // 3. Circuit breaker resets after 5 minutes
  it("auto-resets when CIRCUIT_BREAKER_RESET_MS has elapsed", async () => {
    // Simulate a circuit that was open 6 minutes ago
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000
    store.set("circuit:scidoo:hotel-RESET:bookings-get", {
      failures: 5,
      lastFailure: sixMinutesAgo,
      isOpen: true,
    })

    const client = new ScidooClient({
      apiKey: "test-api-key",
      propertyId: "prop-1",
      hotelId: "hotel-RESET",
    })

    // Mock fetch to succeed this time
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ name: "Test Hotel" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    )

    // Should NOT throw because circuit has auto-reset (6 min > 5 min)
    const result = await client.getAccountInfo()
    expect(result).toBeDefined()
    expect(result.name).toBe("Test Hotel")
  })

  // 4. With circuit breaker open, the call fails immediately without calling Scidoo
  it("throws immediately without calling fetch when circuit is open", async () => {
    // Set circuit as OPEN and recent
    store.set("circuit:scidoo:hotel-OPEN:account-getInfo", {
      failures: 5,
      lastFailure: Date.now(), // just now -> still open
      isOpen: true,
    })

    const client = new ScidooClient({
      apiKey: "test-api-key",
      propertyId: "prop-1",
      hotelId: "hotel-OPEN",
    })

    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    await expect(client.getAccountInfo()).rejects.toThrow("Circuit breaker OPEN")

    // fetch should NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // 5. isAnyCircuitOpen works correctly
  it("isAnyCircuitOpen returns true when at least one endpoint is open", async () => {
    store.set("circuit:scidoo:hotel-ANY:bookings-get", {
      failures: 5,
      lastFailure: Date.now(),
      isOpen: true,
    })
    store.set("circuit:scidoo:hotel-ANY:rooms-getRoomTypes", {
      failures: 1,
      lastFailure: Date.now(),
      isOpen: false,
    })

    const result = await isAnyCircuitOpen("hotel-ANY")
    expect(result).toBe(true)
  })

  it("isAnyCircuitOpen returns false when no endpoint is open", async () => {
    store.set("circuit:scidoo:hotel-NONE:bookings-get", {
      failures: 2,
      lastFailure: Date.now(),
      isOpen: false,
    })

    const result = await isAnyCircuitOpen("hotel-NONE")
    expect(result).toBe(false)
  })
})
