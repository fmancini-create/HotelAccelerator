import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

describe("telephony provider security boundary", () => {
  it("riserva la configurazione provider agli admin tenant", () => {
    const genericRoute = source("app/api/telephony/providers/route.ts")
    const legacy3cx = source("app/api/telephony/3cx/route.ts")
    expect(genericRoute).toContain("requireTenantAdmin")
    expect(legacy3cx).toContain("requireTenantAdmin")
  })

  it("il click-to-call usa il dispatcher provider e non importa direttamente 3CX", () => {
    const click = source("app/api/telephony/click-to-call/route.ts")
    expect(click).toContain("makeTelephonyCall")
    expect(click).toContain("loadActiveTelephonyRow")
    expect(click).not.toContain("threecx-client")
    expect(click).not.toContain("toThreeCxConfig")
  })

  it("la pagina Canali non presenta piu il telefono come 3CX-only", () => {
    const channels = source("app/admin/channels/page.tsx")
    expect(channels).toContain('name: "Centralino telefonico"')
    expect(channels).toContain('/api/telephony/providers')
    expect(channels).not.toContain('name: "Telefono IP (3CX)"')
  })

  it("blocca SSRF, redirect e reti private negli adapter", () => {
    const urlGuard = source("lib/telephony/provider-url.ts")
    const adapters = source("lib/telephony/adapters.ts")
    expect(urlGuard).toContain('parsed.protocol !== "https:"')
    expect(urlGuard).toContain("lookup(host")
    expect(urlGuard).toContain("isBlockedTelephonyAddress")
    expect(adapters).toContain('redirect: "error"')
    expect(adapters).toContain("ensureTelephonyHostIsPublic")
  })

  it("la migration mantiene un solo PBX attivo e RPC solo service-role", () => {
    const migration = source("supabase/migrations/20260905210000_telephony_provider_agnostic.sql")
    expect(migration).toContain("telephony_integrations_one_active_per_property")
    expect(migration).toContain("where is_active")
    expect(migration).toContain("upsert_active_telephony_integration")
    expect(migration).toContain("grant execute on function")
    expect(migration).toContain("to service_role")
    expect(migration).toContain("revoke all on function")
  })
})
