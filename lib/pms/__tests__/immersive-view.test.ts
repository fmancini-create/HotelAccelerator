import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("viewport immersivo del PMS", () => {
  it("non lascia che Puppeteer riduca la sessione Browserbase a 800x600", () => {
    const route = read("app/api/crm/pms-browser-session/route.ts")
    expect(route).toContain("defaultViewport: null")
  })

  it("porta la Live View sopra i layout interni e usa tutta la finestra", () => {
    const page = read("app/admin/crm/pms-sync/gestionale/page.tsx")
    expect(page).toContain("fixed inset-0")
    expect(page).toContain("h-[100dvh]")
    expect(page).toContain("w-screen")
    expect(page).toContain("absolute inset-0 h-full w-full")
  })

  it("mostra la barra solo tramite il richiamo superiore o il focus", () => {
    const css = read("app/globals.css")
    const start = css.indexOf('[data-platform-header][data-immersive="true"]')
    const immersiveRules = css.slice(start, css.indexOf(".dark", start))
    expect(immersiveRules).toContain('html[data-pms-menu-visible="true"]')
    expect(immersiveRules).toContain(":focus-within")
    expect(immersiveRules).not.toContain(":hover")
  })
})
