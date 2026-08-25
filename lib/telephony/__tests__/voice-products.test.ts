import { describe, expect, it } from "vitest"
import {
  getVoiceProduct,
  normalizeVoiceLabel,
  resolveSharedVoiceKnowledgeBases,
  resolveVoiceKnowledgeBase,
  type VoiceKnowledgeBaseCandidate,
} from "@/lib/telephony/voice-products"

function base(overrides: Partial<VoiceKnowledgeBaseCandidate> = {}): VoiceKnowledgeBaseCandidate {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? "Base",
    description: overrides.description ?? null,
    source_count: overrides.source_count ?? 1,
  }
}

describe("prodotti dell'assistente vocale 3CX", () => {
  it("mappa le quattro chiavi senza accettare valori approssimativi", () => {
    expect(getVoiceProduct("hotel-accelerator")?.dtmf).toBe("1")
    expect(getVoiceProduct("santaddeo-rms")?.dtmf).toBe("2")
    expect(getVoiceProduct("hotel-profit-ai")?.dtmf).toBe("3")
    expect(getVoiceProduct("manubot")?.dtmf).toBe("4")
    expect(getVoiceProduct("hotel")).toBeNull()
  })

  it("normalizza accenti, punteggiatura e spazi", () => {
    expect(normalizeVoiceLabel("  Hôtel--Profit   AI ")).toBe("hotel profit ai")
  })

  it("trova una base per nome esatto normalizzato", () => {
    const product = getVoiceProduct("santaddeo-rms")!
    const target = base({ name: "Santaddeo RMS" })
    const result = resolveVoiceKnowledgeBase(product, [base({ name: "Altro" }), target])

    expect(result).toEqual({ ok: true, base: target, matchedBy: "name" })
  })

  it("preferisce il marker stabile nella descrizione", () => {
    const product = getVoiceProduct("manubot")!
    const target = base({ name: "Procedure operative", description: "Manuali [voice:manubot]" })
    const result = resolveVoiceKnowledgeBase(product, [target, base({ name: "ManuBot" })])

    expect(result).toEqual({ ok: true, base: target, matchedBy: "marker" })
  })

  it("fallisce chiuso quando il nome e' ambiguo", () => {
    const product = getVoiceProduct("hotel-profit-ai")!
    const result = resolveVoiceKnowledgeBase(product, [
      base({ name: "Hotel Profit AI" }),
      base({ name: "HotelProfit AI" }),
    ])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("ambiguous")
  })

  it("non usa corrispondenze parziali che potrebbero scegliere il prodotto sbagliato", () => {
    const product = getVoiceProduct("hotel-accelerator")!
    const result = resolveVoiceKnowledgeBase(product, [base({ name: "Hotel Accelerator prova vecchia" })])

    expect(result).toEqual({ ok: false, reason: "not_found", candidates: [] })
  })

  it("seleziona come condivise solo le basi con il marker esatto del prodotto", () => {
    const product = getVoiceProduct("santaddeo-rms")!
    const shared = base({ name: "Policy comuni", description: "[voice-shared:santaddeo-rms]" })
    const otherTenantProduct = base({ name: "Altro prodotto", description: "[voice-shared:manubot]" })
    const primary = base({ name: "Santaddeo RMS", description: "[voice:santaddeo-rms]" })

    expect(resolveSharedVoiceKnowledgeBases(product, [primary, shared, otherTenantProduct])).toEqual([shared])
  })
})
