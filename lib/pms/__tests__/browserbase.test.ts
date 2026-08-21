import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { sessioneBrowserbaseAttiva } from "@/lib/pms/browserbase"

describe("Browserbase PMS", () => {
  it("riusa soltanto sessioni ancora apribili", () => {
    expect(sessioneBrowserbaseAttiva("PENDING")).toBe(true)
    expect(sessioneBrowserbaseAttiva("RUNNING")).toBe(true)
    expect(sessioneBrowserbaseAttiva("COMPLETED")).toBe(false)
    expect(sessioneBrowserbaseAttiva("TIMED_OUT")).toBe(false)
    expect(sessioneBrowserbaseAttiva("ERROR")).toBe(false)
    expect(sessioneBrowserbaseAttiva(null)).toBe(false)
  })
})
