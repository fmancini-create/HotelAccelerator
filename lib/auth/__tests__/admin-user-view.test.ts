import { describe, expect, it } from "vitest"

import { adminUserFromPlatformMe } from "@/lib/auth/admin-user-view"

describe("vista amministrativa dell'identita piattaforma", () => {
  it("riconosce il superadmin senza una riga admin_users", () => {
    expect(
      adminUserFromPlatformMe({
        role: "super_admin",
        adminUserId: null,
        email: "superadmin@example.test",
        name: "Super Admin",
        activePropertyId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({
      id: undefined,
      role: "super_admin",
      property_id: "11111111-1111-4111-8111-111111111111",
      can_upload: true,
      can_delete: true,
      can_move: true,
      can_manage_users: true,
    })
  })

  it("mantiene i permessi espliciti di un membro tenant", () => {
    expect(
      adminUserFromPlatformMe({
        role: "member",
        memberRole: "editor",
        adminUserId: "22222222-2222-4222-8222-222222222222",
        email: "editor@example.test",
        activePropertyId: "11111111-1111-4111-8111-111111111111",
        canUpload: true,
        canDelete: false,
        canMove: true,
        canManageUsers: false,
      }),
    ).toMatchObject({
      role: "editor",
      can_upload: true,
      can_delete: false,
      can_move: true,
      can_manage_users: false,
    })
  })

  it("usa il flag amministrativo effettivo, non il ruolo testuale legacy", () => {
    expect(
      adminUserFromPlatformMe({
        role: "member",
        memberRole: "admin",
        email: "member@example.test",
      }),
    ).toMatchObject({ role: "editor", can_manage_users: false })

    expect(
      adminUserFromPlatformMe({
        role: "tenant_admin",
        memberRole: "editor",
        email: "tenant-admin@example.test",
      }),
    ).toMatchObject({ role: "admin" })
  })

  it("non crea un utente per una sessione assente", () => {
    expect(adminUserFromPlatformMe({ role: "none" })).toBeNull()
  })
})
