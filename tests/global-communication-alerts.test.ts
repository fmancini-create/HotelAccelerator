import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), "utf8")
}

describe("global communication alerts", () => {
  it("mounts the alert listener once in the tenant layout", () => {
    const layout = source("app/admin/layout.tsx")
    expect(layout).toContain("GlobalCommunicationAlerts")
    expect(layout.match(/<GlobalCommunicationAlerts\s*\/>/g)).toHaveLength(1)
  })

  it("subscribes only to inbound tenant messages", () => {
    const component = source("components/admin/global-communication-alerts.tsx")
    expect(component).toContain('table: "messages"')
    expect(component).toContain("filter: `property_id=eq.${propertyId}`")
    expect(component).toContain('row.sender_type !== "customer"')
    expect(component).toContain("remember(id)")
  })

  it("keeps phone data behind server-side tenant and area checks", () => {
    const route = source("app/api/platform/communication-alerts/phone/route.ts")
    expect(route).toContain('requireAreaApi("calls", request)')
    expect(route).toContain('.eq("property_id", identity.propertyId)')
    expect(route).toContain('.eq("direction", "inbound")')
    expect(route).toContain('.limit(LIMIT)')

    const component = source("components/admin/global-communication-alerts.tsx")
    expect(component).not.toContain('table: "phone_calls"')
    expect(component).toContain("/api/platform/communication-alerts/phone")
    expect(component).toContain("response.status === 403")
  })

  it("provides both audible and visible alerts without an external audio asset", () => {
    const component = source("components/admin/global-communication-alerts.tsx")
    expect(component).toContain("createOscillator")
    expect(component).toContain("animate-pulse")
    expect(component).toContain('aria-live="assertive"')
    expect(component).not.toMatch(/\.(mp3|wav|ogg)/)
  })
})
