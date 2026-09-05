import { describe, expect, it } from "vitest"

import { isMobileUserAgent, shouldRouteToMobileTimeClock } from "@/lib/auth/mobile-login-gate"

describe("mobile HR time-clock login gate", () => {
  it("recognizes common mobile user agents", () => {
    expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148")).toBe(true)
    expect(isMobileUserAgent("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36")).toBe(true)
    expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36")).toBe(false)
  })

  it("routes only active employees explicitly required to punch on mobile", () => {
    expect(
      shouldRouteToMobileTimeClock({
        mobile: true,
        moduleStatus: "active",
        moduleExpiresAt: null,
        employmentStatus: "active",
        requiresTimeClock: true,
      }),
    ).toBe(true)

    expect(
      shouldRouteToMobileTimeClock({
        mobile: false,
        moduleStatus: "active",
        moduleExpiresAt: null,
        employmentStatus: "active",
        requiresTimeClock: true,
      }),
    ).toBe(false)

    expect(
      shouldRouteToMobileTimeClock({
        mobile: true,
        moduleStatus: "active",
        moduleExpiresAt: null,
        employmentStatus: "active",
        requiresTimeClock: false,
      }),
    ).toBe(false)
  })

  it("accepts valid trials and rejects expired or inactive HR modules", () => {
    const now = Date.parse("2026-09-05T14:00:00Z")

    expect(
      shouldRouteToMobileTimeClock(
        {
          mobile: true,
          moduleStatus: "trial",
          moduleExpiresAt: "2026-09-06T14:00:00Z",
          employmentStatus: "active",
          requiresTimeClock: true,
        },
        now,
      ),
    ).toBe(true)

    expect(
      shouldRouteToMobileTimeClock(
        {
          mobile: true,
          moduleStatus: "trial",
          moduleExpiresAt: "2026-09-04T14:00:00Z",
          employmentStatus: "active",
          requiresTimeClock: true,
        },
        now,
      ),
    ).toBe(false)

    expect(
      shouldRouteToMobileTimeClock({
        mobile: true,
        moduleStatus: "inactive",
        moduleExpiresAt: null,
        employmentStatus: "active",
        requiresTimeClock: true,
      }),
    ).toBe(false)
  })

  it("fails open when data is missing or the employee is not active", () => {
    expect(
      shouldRouteToMobileTimeClock({
        mobile: true,
        moduleStatus: undefined,
        moduleExpiresAt: null,
        employmentStatus: "active",
        requiresTimeClock: true,
      }),
    ).toBe(false)

    expect(
      shouldRouteToMobileTimeClock({
        mobile: true,
        moduleStatus: "active",
        moduleExpiresAt: null,
        employmentStatus: "inactive",
        requiresTimeClock: true,
      }),
    ).toBe(false)
  })
})
