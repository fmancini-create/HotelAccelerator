import { describe, expect, it } from "vitest"
import { normalizeVoiceCallerAliases, normalizeVoiceSupportAliases } from "@/lib/telephony/voice-request"

describe("voice request aliases", () => {
  it("mantiene il numero chiamante canonico e accetta gli alias storici", () => {
    expect(normalizeVoiceCallerAliases({ caller_number: "+393358046836", caller: "111" })).toMatchObject({
      caller_number: "+393358046836",
    })
    expect(normalizeVoiceCallerAliases({ ani: 3358046836 })).toMatchObject({ caller_number: "3358046836" })
  })

  it("trasforma le cifre DTMF della licenza nel campo customer_code", () => {
    expect(normalizeVoiceSupportAliases({ dtmf_digits: "3 4 9 3 8 4 0" })).toMatchObject({
      customer_code: "3493840",
    })
    expect(normalizeVoiceSupportAliases({ license_digits: 3493840 })).toMatchObject({ customer_code: "3493840" })
  })

  it("non sovrascrive un customer_code gia presente", () => {
    expect(normalizeVoiceSupportAliases({ customer_code: "HPA-3493840", digits: "1111111" })).toMatchObject({
      customer_code: "HPA-3493840",
    })
  })
})
