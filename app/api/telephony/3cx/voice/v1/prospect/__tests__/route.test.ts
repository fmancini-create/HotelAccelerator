import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateVoiceInbound: vi.fn(),
  answerVoiceQuestion: vi.fn(),
  takeVoiceRequest: vi.fn(),
  serviceErrorVoiceResponse: vi.fn(),
  getVoiceIvrRoute: vi.fn(),
  getVoiceIvrSharedBaseIds: vi.fn(),
  isVoiceSupportHub: vi.fn(),
  touchSharedPbxRouteHint: vi.fn(),
  captureSharedPbxVoiceExchange: vi.fn(),
}))

vi.mock("@/lib/telephony/inbound-auth", () => ({ authenticateVoiceInbound: mocks.authenticateVoiceInbound }))
vi.mock("@/lib/telephony/voice-agent", () => ({ answerVoiceQuestion: mocks.answerVoiceQuestion }))
vi.mock("@/lib/telephony/voice-products", () => ({
  VOICE_FALLBACK_EXTENSION: "200",
  getVoiceProduct: () => ({ key: "santaddeo-rms", label: "Santaddeo RMS" }),
}))
vi.mock("@/lib/telephony/voice-rate-limit", () => ({ takeVoiceRequest: mocks.takeVoiceRequest }))
vi.mock("@/lib/telephony/voice-response", () => ({ serviceErrorVoiceResponse: mocks.serviceErrorVoiceResponse }))
vi.mock("@/lib/telephony/voice-routing", () => ({
  getVoiceIvrRoute: mocks.getVoiceIvrRoute,
  getVoiceIvrSharedBaseIds: mocks.getVoiceIvrSharedBaseIds,
  isMissingVoiceRoutingSchema: () => false,
}))
vi.mock("@/lib/telephony/voice-support-customer", () => ({ isVoiceSupportHub: mocks.isVoiceSupportHub }))
vi.mock("@/lib/telephony/shared-pbx-routing", () => ({
  touchSharedPbxRouteHint: mocks.touchSharedPbxRouteHint,
  captureSharedPbxVoiceExchange: mocks.captureSharedPbxVoiceExchange,
}))

const HUB = "6b1e7c05-18b5-43a3-b7bd-1ae09e6921b7"
const BASE = "19ff108d-06c0-4123-8a6b-56b1cde09921"

async function loadRoute() {
  vi.resetModules()
  return import("../route")
}

function setupRoute() {
  mocks.authenticateVoiceInbound.mockResolvedValue({ ok: true, propertyId: HUB })
  mocks.isVoiceSupportHub.mockResolvedValue(true)
  mocks.takeVoiceRequest.mockReturnValue({ allowed: true })
  mocks.getVoiceIvrSharedBaseIds.mockResolvedValue([])
  mocks.touchSharedPbxRouteHint.mockResolvedValue(true)
  mocks.captureSharedPbxVoiceExchange.mockResolvedValue("voice-call")
  mocks.getVoiceIvrRoute.mockResolvedValue({
    id: "115a9ff2-7b49-4ba6-8b12-c5b93a9523a5",
    primary_knowledge_base_id: BASE,
    agent_label: "Informazioni Santaddeo RMS",
    fallback_destination: "200",
    is_active: true,
    product_key: "santaddeo-rms",
    crm_tool_key: "caller_lookup",
  })
}

describe("POST /api/telephony/3cx/voice/v1/prospect", () => {
  it("interroga la knowledge base e registra la conversazione del PBX condiviso", async () => {
    setupRoute()
    mocks.answerVoiceQuestion.mockResolvedValue({
      ok: true,
      speech: "Santaddeo RMS è il sistema di revenue management di 4BID.",
      transfer: { required: false, destination: "200", reason: "none" },
    })

    const { POST } = await loadRoute()
    const response = await POST(new NextRequest("https://example.test/api/telephony/3cx/voice/v1/prospect?product=santaddeo-rms", {
      method: "POST",
      body: JSON.stringify({ question: "Cos'è Santaddeo?", caller_number: "+393331234567", history: [] }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.answerVoiceQuestion).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: HUB,
      productKey: "santaddeo-rms",
      primaryKnowledgeBaseId: BASE,
      question: "Cos'è Santaddeo?",
    }))
    expect(mocks.touchSharedPbxRouteHint).toHaveBeenCalledWith({
      targetPropertyId: HUB,
      callerNumber: "+393331234567",
    })
    expect(mocks.captureSharedPbxVoiceExchange).toHaveBeenCalledWith(expect.objectContaining({
      targetPropertyId: HUB,
      callerNumber: "+393331234567",
      question: "Cos'è Santaddeo?",
      responseSpeech: "Santaddeo RMS è il sistema di revenue management di 4BID.",
    }))
  })

  it("non trasferisce automaticamente se la risposta propone un operatore", async () => {
    setupRoute()
    mocks.answerVoiceQuestion.mockResolvedValue({
      ok: true,
      speech: "Non ho una risposta sufficientemente sicura. Se preferisce, posso metterla in contatto con un operatore.",
      transfer: { required: true, destination: "200", reason: "not_grounded" },
    })

    const { POST } = await loadRoute()
    const response = await POST(new NextRequest("https://example.test/api/telephony/3cx/voice/v1/prospect?product=santaddeo-rms", {
      method: "POST",
      body: JSON.stringify({ question: "Una domanda molto specifica" }),
    }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.speech).toContain("operatore")
    expect(body.transfer.required).toBe(false)
  })
})
