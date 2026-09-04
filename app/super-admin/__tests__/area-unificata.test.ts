import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")

describe("tenant e piattaforma sono contesti distinti", () => {
  it("i due layout dichiarano scope diversi sulla shell condivisa", () => {
    expect(code("app/admin/layout.tsx")).toContain('<PlatformShell scope="tenant">')
    expect(code("app/super-admin/layout.tsx")).toContain('<PlatformShell scope="platform">')
  })

  it("la shell monta chrome diversi e la licenza cliente solo nel tenant", () => {
    const shell = code("components/platform/platform-shell.tsx")
    expect(shell).toContain("<TenantHeader />")
    expect(shell).toContain("<SuperAdminHeader />")
    expect(shell).toContain("scope === \"platform\"")
    expect(shell).toContain("<CustomerLicenseBadge />")
  })

  it("il menu tenant non importa le destinazioni di piattaforma", () => {
    const tenant = code("components/platform/tenant-header.tsx")
    expect(tenant).not.toContain("PLATFORM_ENTRIES")
    expect(tenant).not.toContain("platformNav.map")
    expect(tenant).toContain('href="/super-admin"')
    expect(tenant).toContain("Piattaforma")
  })

  it("il menu Super Admin non monta TenantSwitcher ne voci operative tenant", () => {
    const platform = code("components/platform/super-admin-header.tsx")
    expect(platform).toContain("PLATFORM_ENTRIES")
    expect(platform).not.toContain("TenantSwitcher")
    expect(platform).not.toContain("OPERATIVE_PRIMARY")
    expect(platform).not.toContain("SETTINGS_ENTRIES")
    expect(platform).toContain('href="/admin/dashboard"')
  })
})

describe("dashboard separate", () => {
  it("/super-admin e' una vera dashboard di piattaforma e non redirige al tenant", () => {
    const page = code("app/super-admin/page.tsx")
    expect(page).toContain("PlatformOverviewPanel")
    expect(page).toContain("Dashboard piattaforma")
    expect(page).not.toContain("redirect(")
    expect(page).not.toContain("/admin/dashboard")
  })

  it("la panoramica globale e' inerte fuori da /super-admin", () => {
    const panel = code("components/platform/platform-overview-panel.tsx")
    expect(panel).toContain('pathname === "/super-admin"')
    expect(panel).toContain('pathname.startsWith("/super-admin/")')
    expect(panel).toContain("inPlatformArea ? \"/api/super-admin/dashboard\" : null")
    expect(panel).toContain("if (!inPlatformArea) return null")
  })

  it("non usa dati finti quando la piattaforma non e' misurabile", () => {
    const panel = code("components/platform/platform-overview-panel.tsx")
    for (const forbidden of ["getMockStats", "mockStats", "Villa I Barronci"]) {
      expect(panel).not.toContain(forbidden)
    }
    expect(panel).toContain("Dati della piattaforma non disponibili")
  })
})

describe("accesso iniziale coerente con il ruolo", () => {
  it("un amministratore tenant atterra nel tenant e un Super Admin puro nella piattaforma", () => {
    const auth = code("lib/auth/authorize-user.ts")
    expect(auth).toContain('destination: "/admin/dashboard"')
    expect(auth).toContain('destination: "/super-admin"')
  })

  it("la guardia Super Admin resta fail-closed e i presidi sono montati in entrambe le aree", () => {
    const platform = read("app/super-admin/layout.tsx")
    const tenant = read("app/admin/layout.tsx")
    expect(platform).toContain('collaborator.role !== "super_admin"')
    expect(platform).toContain("!collaborator.is_active")
    for (const component of ["ClientToaster", "AutoLogoutWatchdog"]) {
      expect(platform).toContain(component)
      expect(tenant).toContain(component)
    }
  })
})
