import { describe, expect, it } from "vitest"
import {
  SYSTEM_SEGMENT_PRESETS,
  matchesSegment,
  normalizeSegmentConditions,
  validateSegmentConditions,
} from "@/lib/crm/segment-engine"

describe("CRM segment engine", () => {
  it("matches VIP system preset", () => {
    const preset = SYSTEM_SEGMENT_PRESETS.find((item) => item.conditions.preset === "vip_guests")!
    expect(matchesSegment({ vip_level: "gold" }, preset.conditions)).toBe(true)
    expect(matchesSegment({ vip_level: "platinum" }, preset.conditions)).toBe(true)
    expect(matchesSegment({ vip_level: "silver" }, preset.conditions)).toBe(false)
  })

  it("supports AND and OR combinations", () => {
    const contact = { total_bookings: 3, lead_score: 80, city: "Firenze" }
    expect(matchesSegment(contact, { combinator: "and", rules: [
      { field: "total_bookings", operator: "gte", value: 2 },
      { field: "lead_score", operator: "gte", value: 70 },
    ] })).toBe(true)
    expect(matchesSegment(contact, { combinator: "or", rules: [
      { field: "city", operator: "eq", value: "Roma" },
      { field: "lead_score", operator: "gte", value: 70 },
    ] })).toBe(true)
  })

  it("compares revenue in euros while storage remains cents", () => {
    expect(matchesSegment({ total_revenue_cents: 125_000 }, {
      combinator: "and",
      rules: [{ field: "total_revenue_eur", operator: "gte", value: 1000 }],
    })).toBe(true)
  })

  it("matches birthdays this month and in the next N days", () => {
    const now = new Date("2026-09-05T12:00:00.000Z")
    expect(matchesSegment({ birthday: "1980-09-20" }, {
      combinator: "and", rules: [{ field: "birthday", operator: "birthday_this_month" }],
    }, now)).toBe(true)
    expect(matchesSegment({ birthday: "1980-09-10" }, {
      combinator: "and", rules: [{ field: "birthday", operator: "birthday_next_days", value: 7 }],
    }, now)).toBe(true)
  })

  it("normalizes legacy array conditions", () => {
    const normalized = normalizeSegmentConditions([{ field: "total_bookings", operator: "gte", value: 2 }])
    expect(normalized.combinator).toBe("and")
    expect(normalized.rules).toHaveLength(1)
  })

  it("rejects invalid or incomplete rules", () => {
    expect(validateSegmentConditions({ combinator: "and", rules: [
      { field: "total_bookings", operator: "gte", value: "" },
    ] })).not.toHaveLength(0)
  })
})
