import { afterEach, describe, expect, it, vi } from "vitest"
import { validateWhatsAppRuntimeAccess } from "../runtime-access"

const channel = {
  config: {
    waba_id: "waba-tenant-a",
    phone_number_id: "phone-a",
    graph_version: "v26.0",
  },
  credentials: { access_token: "tenant-token-a" },
} as any

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("validateWhatsAppRuntimeAccess", () => {
  it("accepts only when the runtime token sees the exact WABA/phone pair", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "phone-a", display_phone_number: "+390000" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "phone-a" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await validateWhatsAppRuntimeAccess(channel)

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain("waba-tenant-a/phone_numbers")
    expect(String(fetchMock.mock.calls[1][0])).toContain("phone-a")
  })

  it("rejects a credential that sees the WABA but not the tenant phone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "phone-other" }] }), { status: 200 }),
    ))

    const result = await validateWhatsAppRuntimeAccess(channel)

    expect(result.ok).toBe(false)
    expect(result.error).toContain("non il numero WhatsApp")
  })

  it("rejects a credential that cannot access the tenant WABA", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unsupported get request" } }), { status: 403 }),
    ))

    const result = await validateWhatsAppRuntimeAccess(channel)

    expect(result.ok).toBe(false)
    expect(result.error).toBe("Unsupported get request")
  })
})
