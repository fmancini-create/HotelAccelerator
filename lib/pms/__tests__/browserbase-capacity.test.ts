import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { BrowserbaseApiError, isBrowserbaseCapacityError } from "@/lib/pms/browserbase"

describe("Browserbase capacity classification", () => {
  it.each([
    "Browser minutes have been exhausted for this billing period",
    "Browser minutes limit reached",
    "Project quota exceeded",
    "No browser capacity is currently available",
  ])("classifies provider capacity errors: %s", (message) => {
    expect(isBrowserbaseCapacityError(new BrowserbaseApiError(message, 402))).toBe(true)
  })

  it("does not classify generic provider errors as capacity", () => {
    expect(isBrowserbaseCapacityError(new BrowserbaseApiError("Invalid context id", 400))).toBe(false)
    expect(isBrowserbaseCapacityError(new Error("quota"))).toBe(false)
  })
})
