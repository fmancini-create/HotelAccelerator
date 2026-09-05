import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/modules", () => ({
  isModuleActive: vi.fn().mockResolvedValue(true),
}))

import { getScoutTenantBillingState, scoutCreditPriceCents } from "@/lib/scout/billing"

function chain(result: { data: unknown; error: unknown }) {
  const value = {
    select: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  value.select.mockReturnValue(value)
  value.eq.mockReturnValue(value)
  value.lte.mockReturnValue(value)
  value.order.mockReturnValue(value)
  value.limit.mockReturnValue(value)
  return value
}

describe("Scout billing", () => {
  it("arrotonda sempre il prezzo cliente al centesimo superiore", () => {
    expect(scoutCreditPriceCents(10_000, 3)).toBe(3)
    expect(scoutCreditPriceCents(12_345, 3)).toBe(4)
    expect(scoutCreditPriceCents(1, 1)).toBe(1)
    expect(scoutCreditPriceCents(null, 3)).toBeNull()
    expect(scoutCreditPriceCents(10_000, 0.5)).toBeNull()
  })

  it("restituisce al tenant solo saldo e prezzi Scout, mai economics provider", async () => {
    const tables: Record<string, ReturnType<typeof chain>> = {
      scout_billing_settings: chain({
        data: {
          activation_fee_cents: 9_900,
          activation_included_credits: 50,
          markup_multiplier: 3,
          minimum_purchase_credits: 10,
          updated_at: "2026-09-05T12:00:00.000Z",
        },
        error: null,
      }),
      scout_provider_cost_history: chain({
        data: {
          id: "cost-1",
          provider: "apollo",
          operation: "email_enrichment",
          cost_micro_eur: 12_345,
          effective_from: "2026-09-05T12:00:00.000Z",
          created_at: "2026-09-05T12:00:00.000Z",
        },
        error: null,
      }),
      scout_credit_accounts: chain({
        data: { balance: 12, reserved_credits: 2 },
        error: null,
      }),
    }

    const db = {
      from: vi.fn((table: string) => tables[table]),
    }

    const state = await getScoutTenantBillingState(
      db as never,
      "00000000-0000-0000-0000-000000000001",
    )

    expect(state).toEqual({
      active: true,
      balance: 12,
      reservedCredits: 2,
      availableCredits: 10,
      activationFeeCents: 9_900,
      activationIncludedCredits: 50,
      minimumPurchaseCredits: 10,
      creditPriceCents: 4,
      pricingConfigured: true,
    })

    expect(state).not.toHaveProperty("markupMultiplier")
    expect(state).not.toHaveProperty("providerCostMicroEur")
    expect(state).not.toHaveProperty("unitMarginMicroEur")
  })
})
