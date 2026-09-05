import { describe, expect, it } from "vitest"

import {
  nextRewardTier,
  parseOperatorRewardRule,
  rewardAchievementPercent,
  rewardPeriodIdentity,
  rewardValueForAchievement,
} from "@/lib/platform/operator-goal-rewards-core"

describe("operator goal rewards", () => {
  it("calcola percentuali coerenti per target minimi e massimi", () => {
    expect(rewardAchievementPercent(12, 10, "at_least")).toBe(120)
    expect(rewardAchievementPercent(8, 10, "at_least")).toBe(80)
    expect(rewardAchievementPercent(500, 600, "at_most")).toBe(120)
    expect(rewardAchievementPercent(700, 600, "at_most")).toBe(86)
    expect(rewardAchievementPercent(null, 10, "at_least")).toBeNull()
  })

  it("assegna il premio base al 100% e quello superiore solo alla sua soglia", () => {
    const rule = {
      rewardType: "points" as const,
      rewardValue: 100,
      stretchThresholdPct: 120,
      stretchRewardValue: 180,
    }
    expect(rewardValueForAchievement(rule, 99)).toBeNull()
    expect(rewardValueForAchievement(rule, 100)).toBe(100)
    expect(rewardValueForAchievement(rule, 119)).toBe(100)
    expect(rewardValueForAchievement(rule, 120)).toBe(180)
    expect(nextRewardTier(rule, 80)).toEqual({ thresholdPct: 100, rewardValue: 100 })
    expect(nextRewardTier(rule, 110)).toEqual({ thresholdPct: 120, rewardValue: 180 })
    expect(nextRewardTier(rule, 140)).toBeNull()
  })

  it("valida coppia soglia/premio e richiede che il livello extra valga di più", () => {
    expect(
      parseOperatorRewardRule({
        rewardType: "money",
        rewardValue: 5000,
        stretchThresholdPct: 120,
        stretchRewardValue: 8000,
      }),
    ).toEqual({
      rewardType: "money",
      rewardValue: 5000,
      stretchThresholdPct: 120,
      stretchRewardValue: 8000,
    })

    expect(() =>
      parseOperatorRewardRule({ rewardType: "points", rewardValue: 100, stretchThresholdPct: 120 }),
    ).toThrow(/insieme/)
    expect(() =>
      parseOperatorRewardRule({
        rewardType: "points",
        rewardValue: 100,
        stretchThresholdPct: 120,
        stretchRewardValue: 90,
      }),
    ).toThrow(/maggiore/)
  })

  it("usa il giorno locale del tenant e non UTC per i cicli giornalieri", () => {
    const instant = new Date("2026-09-05T22:30:00.000Z")
    expect(rewardPeriodIdentity("workday", instant, "Europe/Rome")).toEqual({
      key: "day:2026-09-06",
      label: "giornata 06/09/2026",
    })
    expect(rewardPeriodIdentity("30_days", instant, "Europe/Rome")).toEqual({
      key: "month:2026-09",
      label: "ciclo 09/2026 · finestra mobile 30 giorni",
    })
  })

  it("non produce un premio quando il valore non è misurabile", () => {
    const rule = {
      rewardType: "money" as const,
      rewardValue: 2500,
      stretchThresholdPct: null,
      stretchRewardValue: null,
    }
    expect(rewardValueForAchievement(rule, null)).toBeNull()
    expect(nextRewardTier(rule, null)).toBeNull()
  })
})
