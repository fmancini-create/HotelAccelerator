import { describe, expect, it } from "vitest"

import {
  isMobileUserAgent,
  shouldPromptDesktopTimeClock,
  shouldRouteToMobileTimeClock,
} from "@/lib/auth/mobile-login-gate"

describe("HR time-clock login gate", () => {
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

  it("prompts desktop only when a required employee has no open check-in", () => {
    const requiredDesktop = {
      mobile: false,
      moduleStatus: "active",
      moduleExpiresAt: null,
      employmentStatus: "active",
      requiresTimeClock: true,
    }

    expect(
      shouldPromptDesktopTimeClock({ ...requiredDesktop, hasOpenTimeEntry: false }),
    ).toBe(true)

    expect(
      shouldPromptDesktopTimeClock({ ...requiredDesktop, hasOpenTimeEntry: true }),
    ).toBe(false)

    expect(
      shouldPromptDesktopTimeClock({ ...requiredDesktop, hasOpenTimeEntry: undefined }),
    ).toBe(false)

    expect(
      shouldPromptDesktopTimeClock({ ...requiredDesktop, mobile: true, hasOpenTimeEntry: false }),
    ).toBe(false)
  })

  it("does not prompt desktop users without the individual punch requirement", () => {
    expect(
      shouldPromptDesktopTimeClock({
        mobile: false,
        moduleStatus: "active",
        moduleExpiresAt: null,
        employmentStatus: "active",
        requiresTimeClock: false,
        hasOpenTimeEntry: false,
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
      shouldPromptDesktopTimeClock(
        {
          mobile: false,
          moduleStatus: "trial",
          moduleExpiresAt: "2026-09-06T14:00:00Z",
          employmentStatus: "active",
          requiresTimeClock: true,
          hasOpenTimeEntry: false,
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
      shouldPromptDesktopTimeClock(
        {
          mobile: false,
          moduleStatus: "inactive",
          moduleExpiresAt: null,
          employmentStatus: "active",
          requiresTimeClock: true,
          hasOpenTimeEntry: false,
        },
        now,
      ),
    ).toBe(false)
  })

  it("fails open when requirement data is missing or the employee is not active", () => {
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
      shouldPromptDesktopTimeClock({
        mobile: false,
        moduleStatus: "active",
        moduleExpiresAt: null,
        employmentStatus: "inactive",
        requiresTimeClock: true,
        hasOpenTimeEntry: false,
      }),
    ).toBe(false)
  })
})
