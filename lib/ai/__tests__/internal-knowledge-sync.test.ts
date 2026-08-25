import { describe, expect, it } from "vitest"
import {
  contentSha256,
  createInternalKnowledgeSyncSignature,
  getAuthorizedInternalKnowledgeRepository,
  internalKnowledgeSyncSchema,
  verifyInternalKnowledgeSyncSignature,
} from "../internal-knowledge-sync"

const SECRET = "4bid-internal-knowledge-sync-test-secret-123456"
const NOW = 1_700_000_000_000
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

describe("internal knowledge sync", () => {
  it("accetta una firma HMAC valida entro la finestra temporale", () => {
    const rawBody = JSON.stringify(payload())
    const timestamp = String(NOW)
    expect(
      verifyInternalKnowledgeSyncSignature({
        rawBody,
        timestamp,
        signature: createInternalKnowledgeSyncSignature(rawBody, timestamp, SECRET),
        secret: SECRET,
        now: NOW,
      }),
    ).toBe(true)
  })

  it("rifiuta corpo alterato, firma errata e timestamp scaduto", () => {
    const rawBody = JSON.stringify(payload())
    const timestamp = String(NOW)
    const signature = createInternalKnowledgeSyncSignature(rawBody, timestamp, SECRET)

    expect(
      verifyInternalKnowledgeSyncSignature({ rawBody: `${rawBody} `, timestamp, signature, secret: SECRET, now: NOW }),
    ).toBe(false)
    expect(
      verifyInternalKnowledgeSyncSignature({ rawBody, timestamp, signature: "sha256=invalid", secret: SECRET, now: NOW }),
    ).toBe(false)
    expect(
      verifyInternalKnowledgeSyncSignature({ rawBody, timestamp, signature, secret: SECRET, now: NOW + 300_001 }),
    ).toBe(false)
  })

  it("accetta soltanto payload e percorsi interni previsti", () => {
    expect(internalKnowledgeSyncSchema.safeParse(payload()).success).toBe(true)
    expect(internalKnowledgeSyncSchema.safeParse(payload({ source_paths: ["../.env"] })).success).toBe(false)
    expect(internalKnowledgeSyncSchema.safeParse(payload({ product_key: "altro" })).success).toBe(false)
  })

  it("associa ogni prodotto solo al repository configurato", () => {
    const configured = JSON.stringify({ "hotel-accelerator": "fmancini-create/HotelAccelerator" })
    expect(getAuthorizedInternalKnowledgeRepository("hotel-accelerator", configured)).toBe("fmancini-create/HotelAccelerator")
    expect(getAuthorizedInternalKnowledgeRepository("manubot", configured)).toBeNull()
    expect(getAuthorizedInternalKnowledgeRepository("hotel-accelerator", "not-json")).toBeNull()
  })
})
