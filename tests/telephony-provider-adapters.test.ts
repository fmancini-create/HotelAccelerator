import { describe, expect, it } from "vitest"
import { getTelephonyProvider, TELEPHONY_PROVIDERS, TELEPHONY_PROVIDER_IDS } from "@/lib/telephony/providers"

describe("telephony provider registry", () => {
  it("espone i centralini della prima ondata senza duplicati", () => {
    expect(TELEPHONY_PROVIDERS).toHaveLength(9)
    expect(new Set(TELEPHONY_PROVIDER_IDS).size).toBe(TELEPHONY_PROVIDER_IDS.length)
    expect(TELEPHONY_PROVIDER_IDS).toEqual(expect.arrayContaining(["3cx", "wildix", "nethvoice", "voispeed", "yeastar", "teams_phone", "webex_calling", "asterisk_freepbx", "avaya_ip_office"]))
  })

  it("mantiene 3CX reale e non spaccia i provider guidati per connettori verificati", () => {
    expect(getTelephonyProvider("3cx")?.capabilities).toMatchObject({ automaticCheck: true, clickToCall: true, inboundEvents: true, voiceAgent: true })
    expect(getTelephonyProvider("teams_phone")?.connectionMode).toBe("guided")
    expect(getTelephonyProvider("webex_calling")?.capabilities.automaticCheck).toBe(false)
    expect(getTelephonyProvider("avaya_ip_office")?.connectionMode).toBe("bridge")
  })

  it("ogni provider ha una guida e almeno un link ufficiale https", () => {
    for (const provider of TELEPHONY_PROVIDERS) {
      expect(provider.guide.steps.length).toBeGreaterThanOrEqual(4)
      expect(provider.guide.officialDocs.length).toBeGreaterThan(0)
      for (const link of provider.guide.officialDocs) expect(link.url.startsWith("https://")).toBe(true)
    }
  })

  it("abilita click-to-call solo dove esiste un adapter implementato", () => {
    const click = TELEPHONY_PROVIDERS.filter((provider) => provider.capabilities.clickToCall).map((provider) => provider.id)
    expect(click).toEqual(expect.arrayContaining(["3cx", "voispeed", "yeastar", "asterisk_freepbx"]))
    expect(click).not.toContain("wildix")
    expect(click).not.toContain("nethvoice")
  })
})
