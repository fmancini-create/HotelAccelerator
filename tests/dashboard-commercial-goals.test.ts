import { describe, expect, it } from "vitest"

import { parseDashboardGoals } from "@/lib/platform/dashboard-user-settings"

describe("dashboard commercial goals", () => {
  it("accetta trattative, budget e obiettivo extra misurabile", () => {
    const goals = parseDashboardGoals({
      closedDealsTarget: 12,
      closedRevenueTargetCents: 1_500_000,
      customGoalMetric: "conversion_rate",
      customGoalLabel: "Conversione preventivi",
      customGoalTarget: 35,
      customGoalPeriod: "30_days",
    })
    expect(goals.closedDealsTarget).toBe(12)
    expect(goals.closedRevenueTargetCents).toBe(1_500_000)
    expect(goals.customGoalMetric).toBe("conversion_rate")
    expect(goals.customGoalTarget).toBe(35)
  })

  it("non accetta metriche arbitrarie che il sistema non sa misurare", () => {
    expect(() => parseDashboardGoals({ customGoalMetric: "simpatia_cliente", customGoalTarget: 10 })).toThrow(
      /Metrica.*non valida/i,
    )
  })

  it("limita il tasso di conversione al 100%", () => {
    expect(() => parseDashboardGoals({ customGoalMetric: "conversion_rate", customGoalTarget: 101 })).toThrow(/100%/)
  })

  it("usa 30 giorni come periodo predefinito dell'obiettivo extra", () => {
    const goals = parseDashboardGoals({ customGoalMetric: "quotes_sent", customGoalTarget: 20 })
    expect(goals.customGoalPeriod).toBe("30_days")
  })
})
