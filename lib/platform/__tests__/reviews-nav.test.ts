import { describe, expect, it } from "vitest"

import { OPERATIVE_ENTRIES, SETTINGS_ENTRIES, visibleEntries } from "../nav"

describe("reviews navigation", () => {
  it("espone la pagina operativa Recensioni quando il modulo e' attivo", () => {
    const reviews = OPERATIVE_ENTRIES.find((entry) => entry.id === "reviews")

    expect(reviews).toMatchObject({
      href: "/admin/reviews",
      label: "Recensioni",
      placement: "operative",
      module: "reviews",
      adminOnly: true,
      primary: true,
    })

    const visible = visibleEntries(OPERATIVE_ENTRIES, {
      isAdmin: true,
      activeModules: ["reviews"],
    })
    expect(visible.some((entry) => entry.id === "reviews")).toBe(true)
  })

  it("non mostra la pagina operativa quando il modulo Recensioni non e' attivo", () => {
    const visible = visibleEntries(OPERATIVE_ENTRIES, {
      isAdmin: true,
      activeModules: [],
    })
    expect(visible.some((entry) => entry.id === "reviews")).toBe(false)
  })

  it("distingue chiaramente la configurazione dalla pagina operativa", () => {
    const settings = SETTINGS_ENTRIES.find((entry) => entry.id === "reviews-settings")
    expect(settings).toMatchObject({
      href: "/admin/settings/reviews",
      label: "Configurazione recensioni",
      placement: "settings",
      module: "reviews",
      adminOnly: true,
    })
  })
})
