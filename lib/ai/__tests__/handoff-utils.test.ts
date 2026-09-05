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

  it("non scambia una domanda commerciale per nome e cognome", () => {
    expect(extractContactDetails("Come funziona e quanto costa?")).toMatchObject({ firstName: null, lastName: null })
    expect(extractContactDetails("Vorrei informazioni sul prodotto")).toMatchObject({ firstName: null, lastName: null })
  })

  it("mantiene i dati progressivi e completa solo nome, cognome, email e telefono", () => {
    const withName = mergeHandoffContacts(extractContactDetails("Filippo Manini"))
    const withEmail = mergeHandoffContacts(withName, extractContactDetails("filippo@example.com"))
    const completed = mergeHandoffContacts(withEmail, extractContactDetails("+39 333 123 4567"))

    expect(contactIsComplete(withName)).toBe(false)
    expect(contactIsComplete(withEmail)).toBe(false)
    expect(contactIsComplete(completed)).toBe(true)
    expect(completed).toMatchObject({
      firstName: "Filippo",
      lastName: "Manini",
      email: "filippo@example.com",
      phone: "+39 333 123 4567",
    })
  })

  it("chiede solo il campo mancante e non ripete dati gia noti", () => {
    expect(handoffContactPrompt({ firstName: "Filippo", lastName: "Manini" })).toContain("email")
    expect(handoffContactPrompt({ firstName: "Filippo", lastName: "Manini", email: "filippo@example.com" })).toContain("telefono")
    expect(handoffContactPrompt({ firstName: "Filippo", lastName: "Manini", email: "filippo@example.com", phone: "+393331234567" })).toContain("preparando")
  })
})