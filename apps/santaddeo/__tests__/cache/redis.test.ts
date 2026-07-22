/**
 * Tests for cachedQuery and invalidateHotelCache
 *
 * Mock: @upstash/redis
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock Redis ──
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDel = vi.fn()
const mockScan = vi.fn()

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    scan: mockScan,
  })),
}))

// Env vars for Redis initialization
vi.stubEnv("KV_REST_API_URL", "https://fake-redis.upstash.io")
vi.stubEnv("KV_REST_API_TOKEN", "fake-token")

// Import AFTER mocks
const { cachedQuery, invalidateHotelCache, cacheKey } = await import("@/lib/cache/redis")

describe("cachedQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Returns value from cache if it exists
  it("returns cached value when Redis has data", async () => {
    const cachedData = { revenue: 42000, occupancy: 0.78 }
    mockGet.mockResolvedValueOnce(cachedData)

    const computeFn = vi.fn().mockResolvedValue({ revenue: 99999 })

    const result = await cachedQuery("test:key", 300, computeFn)

    expect(result).toEqual(cachedData)
    expect(computeFn).not.toHaveBeenCalled()
    expect(mockGet).toHaveBeenCalledWith("test:key")
  })

  // 2. Calls DB only if cache is empty
  it("calls computeFn when cache is empty", async () => {
    mockGet.mockResolvedValueOnce(null) // cache miss
    mockSet.mockResolvedValueOnce("OK")

    const freshData = { revenue: 55000 }
    const computeFn = vi.fn().mockResolvedValue(freshData)

    const result = await cachedQuery("test:key:miss", 300, computeFn)

    expect(result).toEqual(freshData)
    expect(computeFn).toHaveBeenCalledOnce()
  })

  // 3. Saves result to cache after computing from DB
  it("stores computed value in Redis with correct TTL", async () => {
    mockGet.mockResolvedValueOnce(null) // cache miss
    mockSet.mockResolvedValueOnce("OK")

    const freshData = { adr: 120 }
    const computeFn = vi.fn().mockResolvedValue(freshData)

    await cachedQuery("test:key:store", 600, computeFn)

    expect(mockSet).toHaveBeenCalledWith("test:key:store", freshData, { ex: 600 })
  })
})

describe("invalidateHotelCache", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 4. Deletes all correct keys for a hotel
  it("deletes known namespace keys and scans for remaining ones", async () => {
    mockDel.mockResolvedValue(undefined)
    // scan returns empty (no additional keys)
    mockScan.mockResolvedValueOnce([0, []])

    await invalidateHotelCache("hotel-123")

    // Should have called del with batched known keys
    expect(mockDel).toHaveBeenCalled()
    const deletedKeys = mockDel.mock.calls[0] as string[]
    // Verify it includes keys for metrics, production, channel-production, etc.
    expect(deletedKeys.some((k: string) => k.includes("metrics") && k.includes("hotel-123"))).toBe(true)
    expect(deletedKeys.some((k: string) => k.includes("production") && k.includes("hotel-123"))).toBe(true)

    // Scan should have been called for remaining keys
    expect(mockScan).toHaveBeenCalledWith(0, {
      match: "santaddeo:*:hotel-123:*",
      count: 100,
    })
  })
})

describe("cacheKey", () => {
  it("builds namespaced keys with correct format", () => {
    const key = cacheKey("metrics", "hotel-abc", "mtd")
    expect(key).toBe("santaddeo:metrics:hotel-abc:mtd")
  })

  it("handles multiple parts", () => {
    const key = cacheKey("production", "hotel-xyz", "2025", "06")
    expect(key).toBe("santaddeo:production:hotel-xyz:2025:06")
  })
})
