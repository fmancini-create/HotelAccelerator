import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

describe("HotelAccelerator usa il master grafico Santaddeo", () => {
  const parity = read("app/santaddeo-ui-parity.css")

  it("allinea entrambe le testate interne senza unificare i loro permessi", () => {
    expect(parity).toContain("[data-tenant-header]")
    expect(parity).toContain("[data-super-admin-header]")
    expect(parity).toContain("height: 4rem !important")
    expect(parity).toContain("background: rgb(255 255 255 / 0.95) !important")

    const tenant = read("components/platform/tenant-header.tsx")
    const platform = read("components/platform/super-admin-header.tsx")
    expect(tenant).toContain("data-tenant-header")
    expect(platform).toContain("data-super-admin-header")
  })

  it("copre tutte le testate pubbliche legacy del prodotto, non i siti tenant", () => {
    const signature = "fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md"
    for (const path of [
      "components/platform/platform-landing.tsx",
      "components/platform/feature-landing-page.tsx",
      "app/(platform)/request-access/page.tsx",
    ]) {
      expect(read(path)).toContain(signature)
    }

    expect(parity).toContain("header.fixed.inset-x-0.top-0.z-50")
    expect(parity).not.toContain("TenantHomePage")
    expect(parity).not.toContain("font-serif")
  })

  it("elimina il tema nero dalle quattro pagine corporate rimaste legacy", () => {
    const legacyRoot = 'min-h-screen bg-[#0a0a0a] text-white'
    for (const path of [
      "app/privacy/page.tsx",
      "app/terms/page.tsx",
      "app/trust/page.tsx",
      "app/data-deletion/page.tsx",
    ]) {
      expect(read(path)).toContain(legacyRoot)
    }

    expect(parity).toContain(".min-h-screen.bg-\\[\\#0a0a0a\\].text-white")
  })

  it("carica il layer dopo i token globali così le correzioni hanno precedenza", () => {
    const layout = read("app/layout.tsx")
    const globalsIndex = layout.indexOf('import "./globals.css"')
    const parityIndex = layout.indexOf('import "./santaddeo-ui-parity.css"')
    expect(globalsIndex).toBeGreaterThanOrEqual(0)
    expect(parityIndex).toBeGreaterThan(globalsIndex)
  })
})
