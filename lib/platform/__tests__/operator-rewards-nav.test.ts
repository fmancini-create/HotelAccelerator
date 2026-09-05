import { describe, expect, it } from "vitest"

import { SETTINGS_ENTRIES, visibleEntries } from "../nav"

describe("operator rewards settings navigation", () => {
  it("espone Premi sugli obiettivi nel menu Impostazioni per gli admin tenant", () => {
    const rewards = SETTINGS_ENTRIES.find((entry) => entry.id === "operator-rewards")

    expect(rewards).toMatchObject({
      href: "/admin/settings/rewards",
      label: "Premi sugli obiettivi",
      placement: "settings",
      adminOnly: true,
    })

    const visible = visibleEntries(SETTINGS_ENTRIES, { isAdmin: true })
    expect(visible.some((entry) => entry.id === "operator-rewards")).toBe(true)
  })

  it("non espone la configurazione premi ai membri non amministratori", () => {
    const visible = visibleEntries(SETTINGS_ENTRIES, { isAdmin: false, areas: [] })
    expect(visible.some((entry) => entry.id === "operator-rewards")).toBe(false)
  })
})
