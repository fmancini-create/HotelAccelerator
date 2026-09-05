import { describe, expect, it } from "vitest"

import {
  buildSystemSegments,
  calculateCrossSell,
  type PlatformCustomerAccount,
} from "@/lib/platform/customer-intelligence"

function account(overrides: Partial<PlatformCustomerAccount> = {}): PlatformCustomerAccount {
  return {
    id: "account-1",
    account_number: 1100000,
    property_id: null,
    created_at: new Date().toISOString(),
    profile: {
      customer_account_id: "account-1",
      display_name: "Hotel Test",
      legal_name: null,
      lifecycle_stage: "customer",
      account_type: "hotel_single",
      source: "suite_registry",
      structures_count: 1,
      rooms_count: 40,
      city: "Firenze",
      province: "FI",
      region: "Toscana",
      country: "Italia",
      website: null,
      customer_tier: "bronze",
      health_status: "healthy",
      health_score: 80,
      adoption_score: null,
      churn_risk_score: null,
      satisfaction_score: null,
      potential_value_cents: null,
      mrr_override_cents: null,
      next_renewal_at: null,
      last_touch_at: null,
      owner_label: null,
      tags: [],
      tech_stack: {},
      notes: null,
      metadata: {},
    },
    products: [
      {
        product_key: "santaddeo",
        status: "active",
        external_tenant_id: "tenant-1",
        activated_at: null,
        expires_at: null,
        plan: null,
        mrr_cents: null,
        usage_score: null,
        health_score: null,
        onboarding_status: null,
        last_activity_at: null,
        renewal_at: null,
        last_synced_at: null,
        metrics: {},
      },
    ],
    ...overrides,
  }
}

describe("platform customer intelligence", () => {
  it("prioritizes HotelAccelerator for an existing suite customer", () => {
    const opportunities = calculateCrossSell(account())
    const ha = opportunities.find((item) => item.product === "hotelaccelerator")
    expect(ha).toBeDefined()
    expect(ha!.score).toBeGreaterThanOrEqual(60)
    expect(ha!.reasons).toContain("già cliente della suite")
  })

  it("reduces cross-sell urgency when customer health is critical", () => {
    const healthy = calculateCrossSell(account()).find((item) => item.product === "hotelprofitai")!
    const riskyAccount = account({
      profile: { ...account().profile, health_status: "critical" },
    })
    const risky = calculateCrossSell(riskyAccount).find((item) => item.product === "hotelprofitai")!
    expect(risky.score).toBeLessThan(healthy.score)
  })

  it("builds multi-product and acquisition segments from real state", () => {
    const second = account({
      id: "account-2",
      account_number: 1100002,
      profile: { ...account().profile, customer_account_id: "account-2", display_name: "Hotel Due" },
      products: [
        ...account().products,
        { ...account().products[0], product_key: "hotelaccelerator" },
      ],
    })
    const segments = buildSystemSegments(
      [account(), second],
      [
        { id: "p1", sales_stage: "new", lead_score: 75, next_action_at: null, status: "enriched" },
        { id: "p2", sales_stage: "qualified", lead_score: 50, next_action_at: new Date(Date.now() - 86400000).toISOString(), status: "imported" },
      ],
    )
    expect(segments.find((item) => item.id === "customers-multi")?.count).toBe(1)
    expect(segments.find((item) => item.id === "prospects-hot")?.count).toBe(1)
    expect(segments.find((item) => item.id === "prospects-followup")?.count).toBe(1)
  })

  it("turns satellite telemetry into actionable health segments", () => {
    const base = account()
    const telemetryAccount = account({
      profile: { ...base.profile, churn_risk_score: 72 },
      products: [
        { ...base.products[0], usage_score: 18, last_activity_at: new Date(Date.now() - 16 * 86400000).toISOString() },
        {
          ...base.products[0],
          product_key: "hotelprofitai",
          external_tenant_id: "hpa-1",
          usage_score: 35,
          onboarding_status: "integration_missing",
        },
        {
          ...base.products[0],
          product_key: "manubot",
          external_tenant_id: "mb-1",
          usage_score: 10,
          onboarding_status: "configured_idle",
        },
      ],
    })

    const segments = buildSystemSegments([telemetryAccount], [])
    expect(segments.find((item) => item.id === "health-churn-high")?.count).toBe(1)
    expect(segments.find((item) => item.id === "health-snt-low-usage")?.count).toBe(1)
    expect(segments.find((item) => item.id === "health-hpa-onboarding")?.count).toBe(1)
    expect(segments.find((item) => item.id === "health-mb-idle")?.count).toBe(1)
    expect(segments.find((item) => item.id === "health-stale")?.count).toBe(1)
  })
})
