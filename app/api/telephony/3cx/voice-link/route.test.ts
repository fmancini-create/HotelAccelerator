import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  getAuthenticatedPropertyId: vi.fn(),
  requireAreaApi: vi.fn(),
  isAreaDenied: vi.fn(),
  areaDeniedResponse: vi.fn(),
  loadTelephonyRow: vi.fn(),
  voiceInboundSecretOf: vi.fn(),
  encryptForWrite: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
}))

vi.mock("@/lib/auth-property", () => ({ getAuthenticatedPropertyId: mocks.getAuthenticatedPropertyId }))
vi.mock("@/lib/auth/area-access", () => ({ requireAreaApi: mocks.requireAreaApi }))
vi.mock("@/lib/auth/area-denied", () => ({
  isAreaDenied: mocks.isAreaDenied,
  areaDeniedResponse: mocks.areaDeniedResponse,
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ from: mocks.from }),
}))
vi.mock("@/lib/telephony/config", () => ({
  encryptForWrite: mocks.encryptForWrite,
  loadTelephonyRow: mocks.loadTelephonyRow,
  voiceInboundSecretOf: mocks.voiceInboundSecretOf,
}))

const PROPERTY_ID = "6b1e7c05-18b5-43a3-b7bd-1ae09e6921b7"
const ROW = { id: "3cx-row", property_id: PROPERTY_ID }

async function loadRoute() {
  vi.resetModules()
  return import("./route")
}

function request(method: "POST" | "PUT") {
  return new NextRequest("https://example.test/api/telephony/3cx/voice-link", { method })
}

describe("/api/telephony/3cx/voice-link", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAreaApi.mockResolvedValue(undefined)
    mocks.getAuthenticatedPropertyId.mockResolvedValue(PROPERTY_ID)
    mocks.isAreaDenied.mockReturnValue(false)
    mocks.encryptForWrite.mockImplementation((value: string) => `enc:${value}`)
    mocks.from.mockReturnValue({ update: mocks.update, insert: mocks.insert })
    mocks.update.mockReturnValue({ eq: mocks.eq })
    mocks.eq.mockResolvedValue({ error: null })
    mocks.insert.mockResolvedValue({ error: null })
  })

  it("crea una chiave vocale cifrata e la mostra solo alla prima predisposizione", async () => {
    mocks.loadTelephonyRow.mockResolvedValue(ROW)
    mocks.voiceInboundSecretOf.mockReturnValue(null)

    const { POST } = await loadRoute()
    const response = await POST(request("POST"))
    const body = await response.json()

    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(body).toMatchObject({ ok: true, created: true })
    expect(typeof body.api_key).toBe("string")
    expect(body.api_key.length).toBeGreaterThan(32)
    expect(mocks.encryptForWrite).toHaveBeenCalledWith(body.api_key)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      voice_inbound_secret_encrypted: `enc:${body.api_key}`,
    }))
  })

  it("non restituisce la chiave esistente a una visita successiva", async () => {
    mocks.loadTelephonyRow.mockResolvedValue(ROW)
    mocks.voiceInboundSecretOf.mockReturnValue("already-issued")

    const { POST } = await loadRoute()
    const response = await POST(request("POST"))

    expect(await response.json()).toEqual({ ok: true, created: false, configured: true })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("ruota esplicitamente una chiave già configurata", async () => {
    mocks.loadTelephonyRow.mockResolvedValue(ROW)
    mocks.voiceInboundSecretOf.mockReturnValue("old-key")

    const { PUT } = await loadRoute()
    const response = await PUT(request("PUT"))
    const body = await response.json()

    expect(body).toMatchObject({ ok: true, rotated: true })
    expect(body.api_key).not.toBe("old-key")
    expect(mocks.update).toHaveBeenCalledOnce()
  })
})
