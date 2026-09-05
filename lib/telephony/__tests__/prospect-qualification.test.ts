import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/crm/contact-identity", () => ({ trovaAnagraficaPerNumero: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn() }))

import { decideProspectQualification } from "@/lib/telephony/prospect-qualification"

describe("qualifica prospect telefonico", () => {
  it("dopo la risposta commerciale chiede nome e cognome se mancano", () => {
    const decision = decideProspectQualification({
      history: [],
      question: "A cosa serve e quanto costa ManuBot?",
      currentSpeech: "ManuBot organizza manutenzioni, guasti e interventi.",
    })

    expect(decision.stage).toBe("name")
    expect(decision.prompt).toContain("nome e cognome")
  })

  it("dopo il nome chiede l'email, una sola informazione per turno", () => {
    const decision = decideProspectQualification({
      history: [
        { role: "user", content: "Quanto costa?" },
        { role: "assistant", content: "Il piano parte da 39 euro. Per non farle ripetere tutto al commerciale, mi dice nome e cognome?" },
      ],
      question: "Filippo Mancini",
      currentSpeech: "Grazie.",
    })

    expect(decision.stage).toBe("email")
    expect(decision.prompt).toContain("email di lavoro")
  })

  it("non ripete dati gia noti dal CRM", () => {
    const decision = decideProspectQualification({
      existingName: "Filippo Mancini",
      existingEmail: "filippo@example.com",
      history: [],
      question: "Mi interessa il prodotto",
      currentSpeech: "Certo, le spiego come funziona.",
    })

    expect(decision.stage).toBeNull()
    expect(decision.prompt).toBeNull()
  })

  it("non insiste dopo un rifiuto", () => {
    const decision = decideProspectQualification({
      history: [
        { role: "assistant", content: "Per non farle ripetere tutto al commerciale, mi dice nome e cognome?" },
      ],
      question: "No grazie",
      currentSpeech: "Nessun problema.",
    })

    expect(decision.stage).toBeNull()
  })
})
