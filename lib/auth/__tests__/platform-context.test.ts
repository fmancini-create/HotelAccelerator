import { beforeEach, describe, expect, it, vi } from "vitest"

const cookiesMock = vi.hoisted(() => vi.fn())

vi.mock("next/headers", () => ({ cookies: cookiesMock }))

import { ACTIVE_PROPERTY_COOKIE, readActivePropertyOverride } from "@/lib/platform-context"

describe("tenant attivo del superadmin", () => {
  beforeEach(() => cookiesMock.mockReset())

  it("legge il cookie anche nei Server Component senza NextRequest", async () => {
    const propertyId = "11111111-1111-4111-8111-111111111111"
    cookiesMock.mockResolvedValue({
      get: (name: string) => (name === ACTIVE_PROPERTY_COOKIE ? { value: propertyId } : undefined),
    })

    await expect(readActivePropertyOverride()).resolves.toBe(propertyId)
  })

  it("ignora un tenant non valido", async () => {
    cookiesMock.mockResolvedValue({ get: () => ({ value: "not-a-uuid" }) })
    await expect(readActivePropertyOverride()).resolves.toBeNull()
  })
})
