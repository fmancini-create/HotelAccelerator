import { describe, expect, it } from "vitest"
import { buildVoiceResponse, sanitizeVoiceSpeech } from "@/lib/telephony/voice-response"
import type { GenerateReplyResult } from "@/lib/ai/generate"

function result(overrides: Partial<GenerateReplyResult> = {}): GenerateReplyResult {
  return {
    answer: "La risposta e' questa.",
    confidence: 0.91,
    usedChunks: [],
    reason: "ok",
    handoffIntent: "none",
    contact: { firstName: null, lastName: null, email: null, phone: null },
    grounded: true,
    greetingOnly: false,
    ...overrides,
  }
}

describe("risposta vocale 3CX", () => {
  it("continua la conversazione soltanto con una risposta fondata", () => {
    const decision = buildVoiceResponse(result(), "200")
    expect(decision.transfer).toEqual({ required: false, destination: "200", reason: "none" })
    expect(decision.speech).toBe("La risposta e' questa.")
  })

  it("lascia passare un semplice saluto anche se non richiede fonti", () => {
    const decision = buildVoiceResponse(
      result({ answer: "Buongiorno, come posso aiutarla?", grounded: false, greetingOnly: true }),
      "200",
    )
    expect(decision.transfer.required).toBe(false)
  })

  it("passa all'operatore una risposta fattuale non fondata", () => {
    const decision = buildVoiceResponse(result({ grounded: false }), "200")
    expect(decision.transfer).toEqual({ required: true, destination: "200", reason: "not_grounded" })
    expect(decision.speech).toContain("operatore")
  })

  it("rispetta una richiesta esplicita di parlare con una persona", () => {
    const decision = buildVoiceResponse(result({ handoffIntent: "requested" }), "200", "Attenda in linea.")
    expect(decision.transfer.reason).toBe("staff_requested")
    expect(decision.speech).toBe("Attenda in linea.")
  })

  it("non trasferisce una chiamata quando il contatto e' solo proposto", () => {
    const decision = buildVoiceResponse(result({ handoffIntent: "offered" }), "200")
    expect(decision.transfer).toEqual({ required: false, destination: "200", reason: "none" })
  })

  it("non fa pronunciare markdown e URL", () => {
    expect(sanitizeVoiceSpeech("Vada su [Prenota](https://example.com/x) oppure https://example.com/y **ora**."))
      .toBe("Vada su Prenota oppure ora.")
  })
})
