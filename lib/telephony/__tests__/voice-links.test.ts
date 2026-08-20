import { describe, expect, it } from "vitest"
import { createVoiceAgentLinks } from "@/lib/telephony/voice-links"

describe("agenti telefonici per tenant", () => {
  it("genera un agente per ciascuna base del tenant, senza catalogo predefinito", () => {
    const agents = createVoiceAgentLinks({
      rootUrl: "https://hotelaccelerator.com/",
      propertyId: "c16ad260-2c34-4544-9909-5cd444773986",
      knowledgeBases: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Reception", source_count: 3 },
        { id: "22222222-2222-4222-8222-222222222222", name: "Spa", source_count: 0 },
      ],
    })

    expect(agents).toHaveLength(2)
    expect(agents[0]).toMatchObject({ label: "Reception", status: "ready" })
    expect(agents[1]).toMatchObject({ label: "Spa", status: "empty" })
    expect(agents[0].query_url).toContain("knowledge_base=11111111-1111-4111-8111-111111111111")
    expect(agents[0].query_url).not.toContain("product=")
  })
})
