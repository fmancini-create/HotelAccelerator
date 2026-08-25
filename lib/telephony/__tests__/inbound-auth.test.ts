import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  loadTelephonyRow: vi.fn(),
  inboundSecretOf: vi.fn(),
  voiceInboundSecretOf: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/telephony/config", () => ({
  loadTelephonyRow: mocks.loadTelephonyRow,
  inboundSecretOf: mocks.inboundSecretOf,
  voiceInboundSecretOf: mocks.voiceInboundSecretOf,
}))

async function loadModule() {
  vi.resetModules()
  return import("../inbound-auth")
}

const row = {
  id: "3cx-row",
  property_id: "4bid-property",
  is_active: true,
}

describe("authenticateVoiceInbound", () => {
  it("rifiuta la chiave CRM quando manca una chiave vocale distinta", async () => {
    mocks.loadTelephonyRow.mockResolvedValue(row)
    mocks.inboundSecretOf.mockReturnValue("crm-secret")
    mocks.voiceInboundSecretOf.mockReturnValue(null)

    const { authenticateVoiceInbound } = await loadModule()
    const result = await authenticateVoiceInbound(
      new NextRequest("https://example.test/api/telephony/3cx/voice/v1/prospect?property=4bid-property", {
        headers: { "x-hotelaccelerator-key": "crm-secret" },
      }),
    )

    expect(result).toEqual({ ok: false, status: 401 })
  })

  it("accetta solo la chiave vocale per la stessa property", async () => {
    mocks.loadTelephonyRow.mockResolvedValue(row)
    mocks.inboundSecretOf.mockReturnValue("crm-secret")
    mocks.voiceInboundSecretOf.mockReturnValue("voice-secret")

    const { authenticateVoiceInbound } = await loadModule()
    const result = await authenticateVoiceInbound(
      new NextRequest("https://example.test/api/telephony/3cx/voice/v1/prospect?property=4bid-property", {
        headers: { "x-hotelaccelerator-key": "voice-secret" },
      }),
    )

    expect(result).toMatchObject({ ok: true, propertyId: "4bid-property" })
  })
})
