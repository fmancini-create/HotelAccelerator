import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("isolamento durante il cambio tenant", () => {
  it("ricarica completamente il browser dopo la scelta del superadmin", () => {
    const switcher = read("components/admin/tenant-switcher.tsx")

    expect(switcher).toContain("window.location.reload()")
    expect(switcher).not.toContain('from "next/navigation"')
    expect(switcher).not.toContain("globalMutate")
  })

  it("la pagina Email usa soltanto il tenant attivo della piattaforma", () => {
    const page = read("app/admin/channels/email/email-channels-client.tsx")

    expect(page).toContain('fetch("/api/platform/me"')
    expect(page).toContain("activePropertyId = me.activePropertyId")
    expect(page).not.toContain('.select("property_id")')
    expect(page).toContain('fetch("/api/admin/users"')
  })

  it("azzera i dati del tenant precedente prima di ricaricarli", () => {
    const page = read("app/admin/channels/email/email-channels-client.tsx")

    expect(page).toContain("setChannels([])")
    expect(page).toContain("setUsers([])")
    expect(page).toContain("setSelectedChannel(null)")
    expect(page).toContain("setLabels([])")
    expect(page).toContain("setPropertyId(null)")
  })

  it("mantiene il filtro tenant anche nella route e nel repository email", () => {
    const route = read("app/api/channels/email/route.ts")
    const repository = read("lib/platform-repositories/email-channel.repository.ts")

    expect(route).toContain("getAuthenticatedPropertyId(request)")
    expect(route).toContain("service.listChannels(propertyId)")
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"')
    expect(repository).toContain('.eq("property_id", propertyId)')
  })
})
