import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), "utf8")

describe("Suite ManuBot task hub", () => {
  it("keeps satellite task creation behind the Core registry auth and tenant mapping", () => {
    const route = source("app/api/integrations/manubot/v1/tasks/route.ts")
    const hub = source("lib/manubot/suite-task-hub.ts")

    expect(route).toContain("authenticateRegistryClient")
    expect(route).toContain("x-4bid-product")
    expect(route).toContain("responsible_required")
    expect(route).toContain("idempotency_key")
    expect(hub).toContain('from("suite_tenant_links")')
    expect(hub).toContain('from("suite_product_entitlements")')
    expect(hub).toContain("configuration_required")
    expect(hub).toContain("createTask(payload, input.idempotencyKey)")
  })

  it("distinguishes inactive addon from technical configuration failures", () => {
    const hub = source("lib/manubot/suite-task-hub.ts")
    const route = source("app/api/integrations/manubot/v1/tasks/route.ts")

    expect(hub).toContain('status = "inactive"')
    expect(hub).toContain('status = "configuration_required"')
    expect(route).toContain('"addon_inactive"')
    expect(route).toContain('"addon_configuration_required"')
  })

  it("mounts the Inbox action, keeps the contextual upsell, and creates through the existing tenant-scoped todos route", () => {
    const layout = source("app/admin/inbox/layout.tsx")
    const enhancer = source("components/admin/inbox/inbox-manubot-task-enhancer.tsx")

    expect(layout).toContain("InboxManubotTaskEnhancer")
    expect(enhancer).toContain("Trasforma questa conversazione in un ticket operativo")
    expect(enhancer).toContain("Attiva ManuBot")
    expect(enhancer).toContain('fetch("/api/admin/todos"')
    expect(enhancer).toContain("send_to_manubot: true")
    expect(enhancer).toContain("lastReply")
    expect(enhancer).toContain("ManuBot momentaneamente non disponibile")
  })

  it("records the contextual addon rule as a repository invariant", () => {
    const agents = source("AGENTS.md")
    expect(agents).toContain("addon contestuali, mai funzioni morte")
    expect(agents).toContain("configurazione da completare")
    expect(agents).toContain("Inbox -> ManuBot")
  })
})
