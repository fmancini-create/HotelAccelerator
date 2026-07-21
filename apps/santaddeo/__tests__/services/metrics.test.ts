/**
 * Tests for getDashboardMetrics
 *
 * Mock: Supabase client (passed as argument), capabilities
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock capabilities ──
vi.mock("@/lib/capabilities/get-capabilities", () => ({
  getCapabilities: vi.fn().mockResolvedValue({
    hasChannelBreakdown: true,
    hasRmsRevenue: true,
    hasFiscalData: false,
  }),
}))

const { getDashboardMetrics, computeOccupancy, computeADR, computeRevPAR } = await import(
  "@/lib/services/metrics.service"
)

// ── Helpers: build a mock supabase client ──
function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultRpcResults: Record<string, any> = {
    get_bookings_channel_breakdown: {
      totalRevenue: 50000,
      directRevenue: 30000,
      intermediatedRevenue: 20000,
      channelRevenue: { "Booking.com": 15000, Direct: 30000, Expedia: 5000 },
      roomNights: 120,
      bookingsCount: 45,
    },
    get_cancellation_aggregates: {
      cancelledRevenue: 5000,
      cancelledNights: 10,
      cancellationsCount: 5,
      avgCancellationPickup: 12,
    },
    get_bookings_channel_breakdown_ly: {
      totalRevenue: 45000,
      bookingsCount: 40,
      cancellationsCount: 4,
    },
    ...overrides,
  }

  const rpcFn = vi.fn((name: string) => ({
    // Supabase rpc returns a thenable
    then: (resolve: (v: any) => void) =>
      resolve({ data: defaultRpcResults[name] ?? null, error: null }),
  }))

  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (v: any) => void) =>
      resolve({ data: [], error: null, count: 0 }),
  }

  return {
    rpc: rpcFn,
    from: vi.fn(() => selectChain),
  }
}

describe("getDashboardMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Returns occupancy, ADR and RevPAR
  it("returns a result with occupancy, adr, and revpar fields", async () => {
    const supabase = createMockSupabase()
    const today = new Date()
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split("T")[0]
    const endDate = today.toISOString().split("T")[0]

    const result = await getDashboardMetrics(
      supabase,
      "hotel-test",
      "mtd",
      startDate,
      endDate
    )

    expect(result).toHaveProperty("occupancy")
    expect(result).toHaveProperty("adr")
    expect(result).toHaveProperty("revpar")
    expect(result).toHaveProperty("totalRevenue")
  })

  // 2. Values are valid numbers (not NaN, not undefined, not null)
  it("returns valid numeric values for all KPIs", async () => {
    const supabase = createMockSupabase()
    const result = await getDashboardMetrics(
      supabase,
      "hotel-test",
      "mtd",
      "2025-06-01",
      "2025-06-30"
    )

    expect(typeof result.occupancy).toBe("number")
    expect(Number.isNaN(result.occupancy)).toBe(false)

    expect(typeof result.adr).toBe("number")
    expect(Number.isNaN(result.adr)).toBe(false)

    expect(typeof result.revpar).toBe("number")
    expect(Number.isNaN(result.revpar)).toBe(false)

    expect(typeof result.totalRevenue).toBe("number")
    expect(result.totalRevenue).not.toBeNull()
    expect(result.totalRevenue).not.toBeUndefined()
  })

  // 3. Non-existent hotel_id returns empty structure without crashing
  it("returns empty structure for non-existent hotel without crashing", async () => {
    const emptyRpc: Record<string, any> = {
      get_bookings_channel_breakdown: {
        totalRevenue: 0,
        directRevenue: 0,
        intermediatedRevenue: 0,
        channelRevenue: {},
        roomNights: 0,
        bookingsCount: 0,
      },
      get_cancellation_aggregates: {
        cancelledRevenue: 0,
        cancelledNights: 0,
        cancellationsCount: 0,
        avgCancellationPickup: 0,
      },
      get_bookings_channel_breakdown_ly: {
        totalRevenue: 0,
        bookingsCount: 0,
        cancellationsCount: 0,
      },
    }
    const supabase = createMockSupabase(emptyRpc)

    const result = await getDashboardMetrics(
      supabase,
      "non-existent-hotel",
      "mtd",
      "2025-01-01",
      "2025-01-31"
    )

    // Should not throw, should return valid structure
    expect(result).toBeDefined()
    expect(result.totalRevenue).toBe(0)
    expect(result.bookingsCount).toBe(0)
    expect(typeof result.occupancy).toBe("number")
  })
})

describe("computeOccupancy", () => {
  it("returns 0 when totalRooms is 0", () => {
    expect(computeOccupancy(0, 0, 30)).toBe(0)
  })
})

describe("computeADR", () => {
  it("returns 0 when roomNights is 0", () => {
    expect(computeADR(50000, 0)).toBe(0)
  })

  it("computes correctly with valid inputs", () => {
    expect(computeADR(10000, 100)).toBe(100)
  })
})

describe("computeRevPAR", () => {
  it("returns 0 when totalRooms is 0", () => {
    expect(computeRevPAR(50000, 0, 30)).toBe(0)
  })
})
