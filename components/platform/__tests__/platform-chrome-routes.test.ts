import { describe, expect, it } from "vitest"

import { isFullHeightAdminPage, isImmersiveAdminPage } from "@/components/platform/platform-chrome-routes"

describe("chrome delle pagine admin", () => {
  it("tratta il gestionale PMS come pagina immersiva", () => {
    expect(isImmersiveAdminPage("/admin/crm/pms-sync/gestionale")).toBe(true)
    expect(isImmersiveAdminPage("/admin/crm/pms-sync/gestionale/sessione")).toBe(true)
    expect(isImmersiveAdminPage("/admin/crm/pms-sync")).toBe(false)
    expect(isImmersiveAdminPage("/admin/crm/pms-sync/apprendimento")).toBe(false)
  })

  it("non modifica il contratto delle pagine a tutta altezza", () => {
    expect(isFullHeightAdminPage("/admin/inbox")).toBe(true)
    expect(isFullHeightAdminPage("/admin/crm/pms-sync/gestionale")).toBe(false)
  })
})
