import { describe, expect, it } from "vitest"
import {
  contactIsComplete,
  extractContactDetails,
  handoffContactPrompt,
  isStaffHandoffFollowup,
  mergeHandoffContacts,
  originalQuestionForHandoff,
} from "@/lib/ai/handoff-utils"

describe("staff handoff conversation state", () => {
  const history = [
    { role: "user" as const, content: "A che ora è il check-in?" },
    {
      role: "assistant" as const,
      content: "Non ho quell'orario disponibile. Se vuole, posso metterla in contatto con lo staff.",
    },
  ]

  it("interpreta 'come?' come seguito della proposta di contatto, non come una nuova domanda", () => {
    expect(isStaffHandoffFollowup("come?", history)).toBe(true)
  })

  it("interpreta nome o recapito dopo l'offerta come accettazione", () => {
    expect(isStaffHandoffFollowup("Filippo Manini", history)).toBe(true)
    expect(isStaffHandoffFollowup("filippo@example.com", history)).toBe(true)
  })

  it("non trasforma un 'come?' isolato in una richiesta allo staff", () => {
    expect(isStaffHandoffFollowup("come?", [{ role: "assistant", content: "La piscina è aperta tutto l'anno." }])).toBe(false)
  })

  it("conserva la domanda iniziale e non salva 'come?' nel task", () => {
    expect(originalQuestionForHandoff(history, "come?")).toBe("A che ora è il check-in?")
  })

  it("raccoglie un nome senza affidarsi al modello", () => {
    expect(extractContactDetails("Filippo Manini")).toMatchObject({ firstName: "Filippo", lastName: "Manini" })
  })

  it("mantiene il nome mentre il recapito arriva in un messaggio successivo", () => {
    const withName = mergeHandoffContacts(extractContactDetails("Filippo Manini"))
    const completed = mergeHandoffContacts(withName, extractContactDetails("filippo@example.com"))

    expect(contactIsComplete(withName)).toBe(false)
    expect(contactIsComplete(completed)).toBe(true)
    expect(completed).toMatchObject({
      firstName: "Filippo",
      lastName: "Manini",
      email: "filippo@example.com",
    })
  })

  it("chiede soltanto il recapito dopo che il nome è stato fornito", () => {
    expect(handoffContactPrompt({ firstName: "Filippo", lastName: "Manini" })).toContain("recapito")
    expect(handoffContactPrompt({ firstName: "Filippo", lastName: "Manini" })).not.toContain("nome e cognome")
  })
})
