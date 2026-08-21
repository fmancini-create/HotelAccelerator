import { beforeEach, describe, expect, it, vi } from "vitest"

const { getCallerIdentity } = vi.hoisted(() => ({
  getCallerIdentity: vi.fn(),
}))

vi.mock("@/lib/auth/admin-access", () => ({
  getCallerIdentity,
}))

import { getMyExtension, resolveIdentity } from "../user-extension"

beforeEach(() => {
  getCallerIdentity.mockReset()
})

describe("resolveIdentity per superadmin", () => {
  it("usa il tenant selezionato senza richiedere una scheda admin_users", async () => {
    getCallerIdentity.mockResolvedValue({
      userId: "0d27d57f-a1c1-4bd9-aedf-30f79b36a10b",
      adminUserId: null,
      email: "superadmin@example.com",
      fullName: "superadmin@example.com",
      propertyId: "tenant-villa",
      role: "super_admin",
      isSuperAdmin: true,
      isTenantAdmin: true,
      canManageUsers: true,
    })

    await expect(resolveIdentity({} as never)).resolves.toEqual({
      propertyId: "tenant-villa",
      userId: "",
      fullName: "superadmin@example.com",
    })
  })

  it("mantiene id e nome della scheda operatore per un utente tenant", async () => {
    getCallerIdentity.mockResolvedValue({
      userId: "auth-user",
      adminUserId: "tenant-user",
      email: "operatore@example.com",
      fullName: "Mario Rossi",
      propertyId: "tenant-villa",
      role: "operator",
      isSuperAdmin: false,
      isTenantAdmin: false,
      canManageUsers: false,
    })

    await expect(resolveIdentity({} as never)).resolves.toEqual({
      propertyId: "tenant-villa",
      userId: "tenant-user",
      fullName: "Mario Rossi",
    })
  })

  it("richiede che il superadmin abbia scelto un tenant", async () => {
    getCallerIdentity.mockResolvedValue({
      userId: "auth-user",
      adminUserId: null,
      email: "superadmin@example.com",
      fullName: "superadmin@example.com",
      propertyId: null,
      role: "super_admin",
      isSuperAdmin: true,
      isTenantAdmin: true,
      canManageUsers: true,
    })

    await expect(resolveIdentity({} as never)).rejects.toThrow("Struttura non determinata")
  })

  it("non interroga gli interni quando non esiste una scheda operatore tenant", async () => {
    const from = vi.fn()
    const identity = {
      propertyId: "tenant-villa",
      userId: "",
      fullName: "superadmin@example.com",
    }

    await expect(getMyExtension({ from } as never, identity)).resolves.toEqual({
      ok: false,
      reason: "none",
      identity,
    })
    expect(from).not.toHaveBeenCalled()
  })
})
