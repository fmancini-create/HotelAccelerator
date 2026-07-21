/**
 * Tests for validateHotelAccess
 *
 * Mocks: global fetch (Supabase REST), @/lib/supabase/server (createClient)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock createClient (supabase.auth.getUser) ──
const mockGetUser = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Ensure env var is set so getServiceKey() does not throw ──
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")

// ── Import AFTER mocks are set up ──
const { validateHotelAccess } = await import("@/lib/auth/validateHotelAccess")

// ── Helpers ──
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockFetchResponses(map: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      for (const [pattern, body] of Object.entries(map)) {
        if (url.includes(pattern)) return jsonResponse(body)
      }
      return jsonResponse([], 404)
    })
  )
}

// ────────────────────────────────────────────────
describe("validateHotelAccess", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
  })

  // 1. Utente non autenticato -> 401
  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "Not authenticated" } })

    const result = await validateHotelAccess("hotel-123")

    expect(result).not.toBeNull()
    const json = await result!.json()
    expect(result!.status).toBe(401)
    expect(json.error).toContain("Non autenticato")
  })

  // 2. Utente autenticato ma hotelId di un altro hotel -> 403
  it("returns 403 when user has no access to the hotel", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    })
    mockFetchResponses({
      "profiles?": [{ role: "property_admin", organization_id: "org-A" }],
      "hotel_users?": [], // no hotel_users match
      "hotels?": [], // no org match either
    })

    const result = await validateHotelAccess("hotel-other")

    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
    const json = await result!.json()
    expect(json.error).toContain("non autorizzato")
  })

  // 3. Super admin -> accesso a qualsiasi hotelId
  it("returns null (access granted) for super_admin", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "admin-1" } },
      error: null,
    })
    mockFetchResponses({
      "profiles?": [{ role: "super_admin", organization_id: "org-X" }],
    })

    const result = await validateHotelAccess("any-hotel-id")

    expect(result).toBeNull() // null = access granted
  })

  // 4. Utente con accesso via hotel_users -> 200
  it("returns null (access granted) when user has hotel_users entry", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-2" } },
      error: null,
    })
    mockFetchResponses({
      "profiles?": [{ role: "property_admin", organization_id: "org-B" }],
      "hotel_users?": [{ id: "hu-1" }], // match found
    })

    const result = await validateHotelAccess("hotel-456")

    expect(result).toBeNull() // null = access granted
  })
})
