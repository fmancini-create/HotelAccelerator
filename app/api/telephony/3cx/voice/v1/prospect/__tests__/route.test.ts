import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateVoiceInbound: vi.fn(),
  answerVoiceQuestion: vi.fn(),
  takeVoiceRequest: vi.fn(),
  serviceErrorVoiceResponse: vi.fn(),
  getVoiceIvrRoute: vi.fn(),
  getInternalKnowledgeSyncDiagnostics: vi.fn(),
  isVoiceSupportHub: vi.fn(),
}))

vi.mock("@/lib/ai/internal-knowledge-sync-status", () => ({
  getInternalKnowledgeSyncDiagnostics: mocks.getInternalKnowledgeSyncDiagnostics,
}))
vi.mock("@/lib/telephony/inbound-auth", () => ({ authenticateVoiceInbound: mocks.authenticateVoiceInbound }))
vi.mock("@/lib/telephony/voice-agent", () => ({ answerVoiceQuestion: mocks.answerVoiceQuestion }))
vi.mock("@/lib/telephony/voice-products", () => ({
  VOICE_FALLBACK_EXTENSION: "200",
  getVoiceProduct: () => ({ key: "hotel-accelerator", label: "Hotel Accelerator" }),
}))
vi.mock("@/lib/telephony/voice-rate-limit", () => ({ takeVoiceRequest: mocks.takeVoiceRequest }))
vi.mock("@/lib/telephony/voice-response", () => ({
  serviceErrorVoiceResponse: mocks.serviceErrorVoiceResponse,
}))
vi.mock("@/lib/telephony/voice-routing", () => ({
  getVoiceIvrRoute: mocks.getVoiceIvrRoute,
  getVoiceIvrSharedBaseIds: vi.fn(),
  isMissingVoiceRoutingSchema: () => false,
}))
vi.mock("@/lib/telephony/voice-support-customer", () => ({ isVoiceSupportHub: mocks.isVoiceSupportHub }))

const HUB = "6b1e7c05-18b5-43a3-b7bd-1ae09e6921b7"
const BASE = "19ff108d-06c0-4123-8a6b-56b1cde09921"

async function loadRoute() {
  vi.resetModules()
  return import("../route")
}

describe("POST /api/telephony/3cx/voice/v1/prospect", () => {
  it("usa il fallback quando la fonte interna non è pronta", async () => {
    mocks.authenticateVoiceInbound.mockResolvedValue({ ok: true, propertyId: HUB })
    mocks.isVoiceSupportHub.mockResolvedValue(true)
    mocks.getVoiceIvrRoute.mockResolvedValue({
      id: "115a9ff2-7b49-4ba6-8b12-c5b93a9523a5",
      primary_knowledge_base_id: BASE,
      agent_label: "Informazioni Hotel Accelerator",
      fallback_destination: "200",
      is_active: true,
      product_key: "hotel-accelerator",
    })
    mocks.getInternalKnowledgeSyncDiagnostics.mockResolvedValue({
      schemaAvailable: true,
      sources: [{ productKey: "hotel-accelerator", knowledgeBaseId: BASE, status: "pending" }],
    })
    mocks.serviceErrorVoiceResponse.mockReturnValue({ ok: false, transfer: { required: true, destination: "200" } })

    const { POST } = await loadRoute()
    const response = await POST(new NextRequest("https://example.test/api/telephony/3cx/voice/v1/prospect?product=hotel-accelerator", {
      method: "POST",
      body: JSON.stringify({ question: "Vorrei informazioni" }),
    }))

    expect(response.status).toBe(503)
    expect(mocks.answerVoiceQuestion).not.toHaveBeenCalled()
  })
})
