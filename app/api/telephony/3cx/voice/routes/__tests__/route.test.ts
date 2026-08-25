import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getKnowledgeBases: vi.fn(),
  getInternalKnowledgeSyncDiagnostics: vi.fn(),
  requireAreaApi: vi.fn(),
  requireTenantAdmin: vi.fn(),
  isVoiceSupportHub: vi.fn(),
  getVoiceIvrRoutes: vi.fn(),
  updateVoiceIvrRoute: vi.fn(),
}))

vi.mock("@/lib/ai/knowledge-bases", () => ({ getKnowledgeBases: mocks.getKnowledgeBases }))
vi.mock("@/lib/ai/internal-knowledge-sync-status", () => ({
  getInternalKnowledgeSyncDiagnostics: mocks.getInternalKnowledgeSyncDiagnostics,
}))
vi.mock("@/lib/auth/admin-access", () => ({
  accessErrorStatus: () => 403,
  requireTenantAdmin: mocks.requireTenantAdmin,
}))
vi.mock("@/lib/auth/area-access", () => ({ requireAreaApi: mocks.requireAreaApi }))
vi.mock("@/lib/telephony/voice-support-customer", () => ({ isVoiceSupportHub: mocks.isVoiceSupportHub }))
vi.mock("@/lib/telephony/voice-routing", () => ({
  getVoiceIvrRoutes: mocks.getVoiceIvrRoutes,
  isMissingVoiceRoutingSchema: () => false,
  updateVoiceIvrRoute: mocks.updateVoiceIvrRoute,
}))

const HUB = "6b1e7c05-18b5-43a3-b7bd-1ae09e6921b7"
const ROUTE = "115a9ff2-7b49-4ba6-8b12-c5b93a9523a5"
const INTERNAL_BASE = "19ff108d-06c0-4123-8a6b-56b1cde09921"
const PUBLIC_BASE = "9f458bb1-0505-426b-9cbb-11fd508bf4dd"

function voiceRoute() {
  return {
    id: ROUTE,
    ivr_path: "2.1",
    intent_key: "prospect_information",
    product_key: "hotel-accelerator",
    agent_label: "Informazioni Hotel Accelerator",
    knowledge_scope: "hub_selected",
    primary_knowledge_base_id: null,
    crm_tool_key: "caller_lookup",
    fallback_mode: "transfer",
    fallback_destination: "200",
    is_active: true,
    status: "missing_primary",
    shared_knowledge_bases: [],
  }
}

function request(primaryKnowledgeBaseId: string | null) {
  return new Request("https://example.test/api/telephony/3cx/voice/routes", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      route_id: ROUTE,
      agent_label: "Informazioni Hotel Accelerator",
      primary_knowledge_base_id: primaryKnowledgeBaseId,
      shared_knowledge_base_ids: [],
      fallback_destination: "200",
      is_active: true,
    }),
  }) as never
}

async function loadRoute() {
  vi.resetModules()
  return import("../route")
}

describe("PUT /api/telephony/3cx/voice/routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAreaApi.mockResolvedValue(undefined)
    mocks.requireTenantAdmin.mockResolvedValue({ isSuperAdmin: true, propertyId: HUB })
    mocks.isVoiceSupportHub.mockResolvedValue(true)
    mocks.getKnowledgeBases.mockResolvedValue([{ id: INTERNAL_BASE, name: "4BID · Hotel Accelerator", source_count: 1 }])
    mocks.getVoiceIvrRoutes.mockResolvedValue([voiceRoute()])
    mocks.getInternalKnowledgeSyncDiagnostics.mockResolvedValue({
      schemaAvailable: true,
      sources: [{ productKey: "hotel-accelerator", knowledgeBaseId: INTERNAL_BASE, status: "ready" }],
    })
    mocks.updateVoiceIvrRoute.mockResolvedValue(undefined)
  })

  it("rifiuta una primaria prospect che non è la fonte interna pronta", async () => {
    const { PUT } = await loadRoute()
    const response = await PUT(request(PUBLIC_BASE))

    expect(response.status).toBe(409)
    expect(mocks.updateVoiceIvrRoute).not.toHaveBeenCalled()
  })

  it("salva solo la primaria interna pronta del prodotto", async () => {
    const { PUT } = await loadRoute()
    const response = await PUT(request(INTERNAL_BASE))

    expect(response.status).toBe(200)
    expect(mocks.updateVoiceIvrRoute).toHaveBeenCalledWith(expect.objectContaining({
      hubPropertyId: HUB,
      routeId: ROUTE,
      primaryKnowledgeBaseId: INTERNAL_BASE,
    }))
  })
})
