import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { addProjectDomain, inspectProjectDomain } from "@/lib/vercel/project-domains"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("Vercel project domains", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_API_TOKEN", "test-token")
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test")
    vi.stubEnv("VERCEL_TEAM_ID", "team_test")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("considera pronto soltanto un dominio verificato e non misconfigured", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        name: "hotel.example.com",
        apexName: "example.com",
        verified: true,
        verification: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        configuredBy: "CNAME",
        misconfigured: false,
        recommendedCNAME: [{ rank: 1, value: "cname.vercel-dns-0.com" }],
      })))

    const result = await inspectProjectDomain("hotel.example.com")
    expect(result.status).toBe("ready")
    expect(result.ready).toBe(true)
    expect(result.dns).toContainEqual({
      type: "CNAME",
      name: "hotel.example.com",
      value: "cname.vercel-dns-0.com",
      purpose: "routing",
    })
  })

  it("restituisce i record Vercel esatti per un dominio apex non configurato", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        name: "example.com",
        apexName: "example.com",
        verified: false,
        verification: [{ type: "TXT", domain: "_vercel.example.com", value: "vc-domain-verify=token" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        configuredBy: null,
        misconfigured: true,
        recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }],
      })))

    const result = await inspectProjectDomain("example.com")
    expect(result.status).toBe("verification_required")
    expect(result.dns).toEqual([
      { type: "TXT", name: "_vercel.example.com", value: "vc-domain-verify=token", purpose: "ownership" },
      { type: "A", name: "@", value: "76.76.21.21", purpose: "routing" },
    ])
  })

  it("non inventa uno stato pronto quando mancano le variabili server", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "")
    const result = await inspectProjectDomain("hotel.example.com")
    expect(result.status).toBe("automation_unavailable")
    expect(result.ready).toBe(false)
  })

  it("gestisce il retry idempotente solo se il dominio appartiene già al progetto", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "conflict" } }, 409))
      .mockResolvedValueOnce(jsonResponse({ name: "hotel.example.com", verified: true })))
    await expect(addProjectDomain("hotel.example.com")).resolves.toMatchObject({ name: "hotel.example.com" })
  })
})
