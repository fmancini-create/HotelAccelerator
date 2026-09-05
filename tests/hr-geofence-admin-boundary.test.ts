import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { SETTINGS_ENTRIES, visibleEntries } from "@/lib/platform/nav"

describe("HR geofence admin boundary", () => {
  it("mostra la configurazione nelle Impostazioni solo agli amministratori", () => {
    const entry = SETTINGS_ENTRIES.find((item) => item.id === "hr-settings")
    expect(entry).toMatchObject({
      href: "/admin/settings/hr",
      placement: "settings",
      module: "hr",
      adminOnly: true,
    })

    const adminVisible = visibleEntries(SETTINGS_ENTRIES, {
      isAdmin: true,
      activeModules: ["hr"],
    })
    expect(adminVisible.some((item) => item.id === "hr-settings")).toBe(true)

    const shiftManagerVisible = visibleEntries(SETTINGS_ENTRIES, {
      isAdmin: false,
      areas: ["hr"],
      activeModules: ["hr"],
    })
    expect(shiftManagerVisible.some((item) => item.id === "hr-settings")).toBe(false)
  })

  it("separa la scrittura geofence dall'API HR operativa", () => {
    const operationalRoute = readFileSync(join(process.cwd(), "app/api/admin/hr/route.ts"), "utf8")
    const settingsRoute = readFileSync(join(process.cwd(), "app/api/admin/hr/settings/route.ts"), "utf8")
    const workforcePanel = readFileSync(join(process.cwd(), "components/hr/hr-workforce-panels.tsx"), "utf8")

    expect(operationalRoute).not.toContain('z.literal("settings")')
    expect(operationalRoute).not.toContain('.from("hr_settings")')
    expect(workforcePanel).not.toContain("HrGeofenceLocationCard")

    expect(settingsRoute).toContain("requireTenantAdmin")
    expect(settingsRoute).toContain('.from("hr_settings")')
    expect(settingsRoute).toContain('action: "hr_geofence_settings_updated"')
  })
})
