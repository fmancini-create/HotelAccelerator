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

  it("mounts the Inbox action, uses authoritative addon state, and creates through the tenant-scoped todos route", () => {
    const layout = source("app/admin/inbox/layout.tsx")
    const enhancer = source("components/admin/inbox/inbox-manubot-task-enhancer.tsx")
    const contextRoute = source("app/api/admin/manubot/addon-context/route.ts")
    const areaMap = source("lib/auth/api-area-map.ts")

    expect(layout).toContain("InboxManubotTaskEnhancer")
    expect(enhancer).toContain('fetch("/api/admin/manubot/addon-context"')
    expect(enhancer).toContain("Trasforma questa conversazione in un ticket operativo")
    expect(enhancer).toContain("Attiva ManuBot")
    expect(enhancer).toContain('addonState === "configuration_required"')
    expect(enhancer).toContain("collegamento tecnico deve essere completato")
    expect(enhancer).toContain('fetch("/api/admin/todos"')
    expect(enhancer).toContain("send_to_manubot: true")
    expect(enhancer).toContain("lastReply")
    expect(enhancer).toContain("ManuBot momentaneamente non disponibile")

    expect(contextRoute).toContain('getSuiteManubotTaskFormData("hotelaccelerator"')
    expect(contextRoute).toContain('requireAreaApi("todos"')
    expect(areaMap).toContain('"/api/admin/manubot/addon-context": "todos"')
  })

  it("makes the Todos page a ManuBot-only addon surface with no local fallback toggle", () => {
    const todosPage = source("app/admin/todos/page.tsx")
    const todoPatch = source("app/api/admin/todos/[id]/route.ts")

    expect(todosPage).toContain('fetch("/api/admin/manubot/addon-context"')
    expect(todosPage).toContain("Attiva ManuBot")
    expect(todosPage).toContain("non verranno creati To-Do locali")
    expect(todosPage).toContain('send_to_manubot: true')
    expect(todosPage).toContain('todo.external_source === "manubot"')
    expect(todosPage).not.toContain("Invia a Manubot")
    expect(todosPage).not.toContain("send_to_manubot: !")
    expect(todoPatch).toContain("manubot_company_id")
  })

  it("records the contextual addon rule as a repository invariant", () => {
    const agents = source("AGENTS.md")
    expect(agents).toContain("addon contestuali, mai funzioni morte")
    expect(agents).toContain("configurazione da completare")
    expect(agents).toContain("Inbox -> ManuBot")
  })
})
