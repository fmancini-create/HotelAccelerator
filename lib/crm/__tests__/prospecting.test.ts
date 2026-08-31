import { describe, expect, it } from "vitest"
import { computeProspectScore, firstProspectAction } from "@/lib/crm/prospecting"

describe("crm prospecting", () => {
  it("prioritizes a decision maker with LinkedIn and verified email", () => {
    const result = computeProspectScore({
      job_title: "General Manager",
      linkedin_url: "https://www.linkedin.com/in/example",
      email: "gm@example.com",
      email_status: "verified",
      organization_name: "Hotel Example",
      organization_domain: "example.com",
      country: "Italy",
    })
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.signals).toContain("decision maker")
  })

  it("starts from LinkedIn when a profile is available", () => {
    expect(firstProspectAction({ linkedin_url: "https://linkedin.com/in/x", email: "x@example.com" })).toBe("linkedin_invite")
  })

  it("falls back to review when there is no reachable channel", () => {
    expect(firstProspectAction({})).toBe("review")
  })
})
