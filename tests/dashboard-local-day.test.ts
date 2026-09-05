import { describe, expect, it } from "vitest"

import { getTenantLocalDayStart, resolveTenantTimeZone } from "@/lib/platform/local-day"

describe("dashboard tenant local day", () => {
  it("uses Europe/Rome summer midnight instead of a rolling 24h window", () => {
    const start = getTenantLocalDayStart(new Date("2026-09-05T14:30:00.000Z"), "Europe/Rome")
    expect(start.toISOString()).toBe("2026-09-04T22:00:00.000Z")
  })

  it("uses Europe/Rome winter midnight with the winter UTC offset", () => {
    const start = getTenantLocalDayStart(new Date("2026-01-10T12:00:00.000Z"), "Europe/Rome")
    expect(start.toISOString()).toBe("2026-01-09T23:00:00.000Z")
  })

  it("falls back safely when a tenant timezone is invalid", () => {
    expect(resolveTenantTimeZone("not/a-timezone")).toBe("Europe/Rome")
  })
})
