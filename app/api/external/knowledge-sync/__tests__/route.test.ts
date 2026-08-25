import { beforeEach, describe, expect, it, vi } from "vitest"
import { contentSha256, createInternalKnowledgeSyncSignature } from "@/lib/ai/internal-knowledge-sync"

vi.mock("@/lib/ai/ingest", () => ({ indexSource: vi.fn().mockResolvedValue({ chunkCount: 1 }) }))

let serviceCalls = 0
let rpcInput: Record<string, unknown> | null = null

const propertyQuery = {
  select: () => propertyQuery,
  eq: () => propertyQuery,
  maybeSingle: async () => ({ data: { id: "hub-4bid" }, error: null }),
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => {
    serviceCalls++
    return {
      from: () => propertyQuery,
      rpc: async (_name: string, input: Record<string, unknown>) => {
        rpcInput = input
        return {
          data: [{ knowledge_base_id: "base-1", knowledge_source_id: "source-1", content_changed: false }],
          error: null,
        }
      },
    }
  },
}))

const SECRET = "4bid-internal-knowledge-route-test-secret-123456"
const CONTENT = "Documentazione interna verificata per il prodotto, con informazioni sufficienti per un test sicuro."

function payload(overrides: Record<string, unknown> = {}) {
  return {
    product_key: "hotel-accelerator",
    repository: "fmancini-create/HotelAccelerator",
    revision: "1c46ef0f750b53501f5a08b25c6fe4cbcb1caae9",
    source_paths: ["docs/3CX_VOICE_AI.md"],
    content_sha256: contentSha256(CONTENT),
    content: CONTENT,
    ...overrides,
  }
}

function requestFor(body: Record<string, unknown>, secret = SECRET) {
  const rawBody = JSON.stringify(body)
  const timestamp = String(Date.now())
  return new Request("https://example.test/api/external/knowledge-sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-knowledge-timestamp": timestamp,
      "x-internal-knowledge-signature": createInternalKnowledgeSyncSignature(rawBody, timestamp, secret),
    },
    body: rawBody,
  }) as any
}

async function loadRoute() {
  vi.resetModules()
  process.env.INTERNAL_KNOWLEDGE_SYNC_SECRET = SECRET
  process.env.INTERNAL_KNOWLEDGE_SYNC_REPOSITORIES = JSON.stringify({
    "hotel-accelerator": "fmancini-create/HotelAccelerator",
  })
  return import("../route")
}

describe("POST /api/external/knowledge-sync", () => {
  beforeEach(() => {
    serviceCalls = 0
    rpcInput = null
    process.env.INTERNAL_KNOWLEDGE_SYNC_SECRET = SECRET
    process.env.INTERNAL_KNOWLEDGE_SYNC_REPOSITORIES = JSON.stringify({
      "hotel-accelerator": "fmancini-create/HotelAccelerator",
    })
  })

  it("rifiuta una firma non valida prima di interrogare il database", async () => {
    const { POST } = await loadRoute()
    const response = await POST(requestFor(payload(), "secret-sbagliato-ma-lungo-almeno-trentadue-caratteri"))
    expect(response.status).toBe(401)
    expect(serviceCalls).toBe(0)
  })

  it("rifiuta un hash del contenuto incoerente prima di interrogare il database", async () => {
    const { POST } = await loadRoute()
    const response = await POST(requestFor(payload({ content_sha256: "a".repeat(64) })))
    expect(response.status).toBe(400)
    expect(serviceCalls).toBe(0)
  })

  it("rifiuta un repository non autorizzato anche con una firma valida", async () => {
    const { POST } = await loadRoute()
    const response = await POST(requestFor(payload({ repository: "altro-owner/altro-repo" })))
    expect(response.status).toBe(403)
    expect(serviceCalls).toBe(0)
  })

  it("risolve il tenant hub lato server e invia il payload validato alla funzione atomica", async () => {
    const { POST } = await loadRoute()
    const response = await POST(requestFor(payload()))
    expect(response.status).toBe(202)
    expect(rpcInput).toMatchObject({
      p_hub_property_id: "hub-4bid",
      p_product_key: "hotel-accelerator",
      p_repository: "fmancini-create/HotelAccelerator",
    })
  })
})
