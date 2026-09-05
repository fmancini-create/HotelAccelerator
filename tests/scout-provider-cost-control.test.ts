import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), "utf8")

describe("Scout provider cost control", () => {
  it("stores platform-only pricing, snapshots and historical event economics", () => {
    const migration = source("supabase/migrations/20260906001500_add_scout_provider_cost_control.sql")

    expect(migration).toContain("platform_scout_billing_settings")
    expect(migration).toContain("markup_multiplier numeric(8,4) not null default 3.0000")
    expect(migration).toContain("platform_scout_provider_usage_snapshots")
    expect(migration).toContain("provider_cost_micros")
    expect(migration).toContain("customer_value_micros")
    expect(migration).toContain("alter column credits_used type numeric(12,4)")
    expect(migration).toContain("revoke all on table public.platform_scout_billing_settings from anon, authenticated")
  })

  it("uses provider-reported fractional credit consumption instead of assuming one", () => {
    const client = source("lib/integrations/apollo/client.ts")
    const providerRoute = source("app/api/admin/crm/apollo/route.ts")
    const scoutRoute = source("app/api/admin/crm/scout/route.ts")

    expect(client).toContain('/people/bulk_match')
    expect(client).toContain("credits_consumed")
    expect(client).toContain("getApolloCreditUsageStats")
    expect(providerRoute).toContain("enrichApolloPersonWithUsage")
    expect(providerRoute).toContain("creditCost: enrichment.creditsConsumed")
    expect(providerRoute).toContain('prospect.status === "enriched" || prospect.email')
    expect(scoutRoute).toContain("reportedCreditCost")
    expect(scoutRoute).not.toContain('creditsUsed: action === "enrich" && response.ok ? 1 : 0')
  })

  it("converts provider currency before applying the Scout markup", () => {
    const migration = source("supabase/migrations/20260906003000_add_scout_fx_pricing.sql")
    const fx = source("lib/integrations/ecb/fx.ts")
    const billing = source("lib/crm/scout-billing.ts")
    const access = source("lib/crm/scout-access.ts")

    expect(migration).toContain("commercial_currency")
    expect(migration).toContain("platform_scout_fx_snapshots")
    expect(migration).toContain("provider_cost_customer_micros")
    expect(migration).toContain("fx_rate_provider_to_customer")
    expect(fx).toContain("eurofxref-daily.xml")
    expect(fx).toContain("toPerEuro / fromPerEuro")
    expect(billing).toContain("providerCostMicros * normalizedFx")
    expect(billing).toContain("providerCostCustomerMicros * settings.markupMultiplier")
    expect(access).toContain("provider_currency")
    expect(access).toContain("customer_currency")
    expect(access).toContain("provider_cost_customer_micros")
  })

  it("freezes cost, multiplier, FX and customer value on each billed Scout event", () => {
    const access = source("lib/crm/scout-access.ts")
    const billing = source("lib/crm/scout-billing.ts")

    expect(access).toContain("economicsForScoutUsage")
    expect(access).toContain("provider_unit_cost_micros")
    expect(access).toContain("provider_cost_micros")
    expect(access).toContain("fx_rate_provider_to_customer")
    expect(access).toContain("provider_cost_customer_micros")
    expect(access).toContain("price_multiplier")
    expect(access).toContain("customer_value_micros")
    expect(billing).toContain("effectiveLeadUnitCostMicros")
    expect(billing).toContain("providerCycleCostCents * 10_000")
  })

  it("shows live reconciliation, FX and tenant margin in superadmin and refreshes both on cron", () => {
    const page = source("app/super-admin/module-costs/page.tsx")
    const panel = source("components/platform/scout-costs-panel.tsx")
    const api = source("app/api/super-admin/scout-costs/route.ts")
    const cron = source("app/api/cron/scout-provider-costs/route.ts")
    const vercel = source("vercel.json")

    expect(page).toContain("<ScoutCostsPanel />")
    expect(panel).toContain("Riconciliazione HotelAccelerator ↔ Apollo")
    expect(panel).toContain("Costo e margine per tenant")
    expect(panel).toContain("Cambio")
    expect(panel).toContain("commercialCurrency")
    expect(api).toContain("unattributedCredits")
    expect(api).toContain("credit_limit_changed")
    expect(api).toContain("fxSnapshots")
    expect(api).toContain("platform_scout_billing_settings_audit")
    expect(cron).toContain('syncApolloUsageSnapshot(db, "cron")')
    expect(cron).toContain("syncScoutFxSnapshot")
    expect(vercel).toContain('/api/cron/scout-provider-costs')
  })
})
