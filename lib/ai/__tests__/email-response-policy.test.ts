import { describe, expect, it } from "vitest"
import { decideEmailAiResponse, type EmailAiResponsePolicy } from "@/lib/ai/email-response-policy"

const policy: EmailAiResponsePolicy = {
  property_id: "00000000-0000-0000-0000-000000000001",
  automated_action: "skip",
  bulk_action: "skip",
  transactional_action: "draft",
  internal_action: "skip",
  unclassified_action: "autopilot",
  trusted_senders: ["booking@trusted.example"],
  blocked_senders: ["robot@blocked.example"],
  blocked_domains: ["noise.example"],
  internal_domains: ["hotel.example"],
  blocked_subject_keywords: ["report giornaliero"],
}

describe("email AI response policy", () => {
  it("blocks hard autoreply signals even for a trusted sender", () => {
    const decision = decideEmailAiResponse(
      { ...policy, trusted_senders: ["booking@trusted.example"] },
      {
        from: "booking@trusted.example",
        subject: "Risposta automatica: ferie",
        headers: { "Auto-Submitted": "auto-replied" },
      },
    )
    expect(decision.action).toBe("skip")
    expect(decision.category).toBe("hard_safety")
  })

  it("blocks machine notification senders before the LLM", () => {
    const decision = decideEmailAiResponse(policy, {
      from: "Google Calendar <calendar-notification@google.com>",
      subject: "Oggi non hai nessun evento in programma",
    })
    expect(decision.action).toBe("skip")
    expect(decision.category).toBe("automated")
  })

  it("downgrades transactional messages to draft by default", () => {
    const decision = decideEmailAiResponse(policy, {
      from: "reservations@partner.example",
      subject: "Nuova prenotazione",
    })
    expect(decision.action).toBe("draft")
    expect(decision.category).toBe("transactional")
  })

  it("uses the tenant internal-domain policy", () => {
    const decision = decideEmailAiResponse(policy, {
      from: "reception@hotel.example",
      subject: "Cambio turno",
    })
    expect(decision.action).toBe("skip")
    expect(decision.category).toBe("internal")
  })

  it("lets ordinary human messages follow the base autopilot mode", () => {
    const decision = decideEmailAiResponse(policy, {
      from: "Mario Rossi <mario.rossi@example.org>",
      subject: "Disponibilità camera",
    })
    expect(decision.action).toBe("autopilot")
    expect(decision.category).toBe("unclassified")
  })

  it("tenant block rules win over normal classification", () => {
    const decision = decideEmailAiResponse(policy, {
      from: "person@noise.example",
      subject: "Ciao",
    })
    expect(decision.action).toBe("skip")
    expect(decision.category).toBe("blocked")
  })
})
