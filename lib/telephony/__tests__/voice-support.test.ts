import { describe, expect, it } from "vitest"
import { resolveAfterHoursMode, resolveSupportHandoff } from "@/lib/telephony/voice-support"

describe("instradamento del supporto vocale", () => {
  it("non interrompe una risposta AI fondata", () => {
    expect(
      resolveSupportHandoff({
        humanHelpRequired: false,
        afterHours: true,
        plan: "free",
        configuredMode: "plan_default",
        configuredExtension: null,
      }),
    ).toMatchObject({ action: "none" })
  })

  it("usa l'operatore durante l'orario di lavoro", () => {
    expect(
      resolveSupportHandoff({
        humanHelpRequired: true,
        afterHours: false,
        plan: "free",
        configuredMode: "plan_default",
        configuredExtension: null,
      }),
    ).toMatchObject({ action: "transfer", destination: "200" })
  })

  it("porta enterprise alla reperibilita e gli altri piani alla registrazione", () => {
    expect(resolveAfterHoursMode("enterprise", "plan_default")).toBe("on_call")
    expect(resolveAfterHoursMode("professional", "plan_default")).toBe("voicemail")
    expect(
      resolveSupportHandoff({
        humanHelpRequired: true,
        afterHours: true,
        plan: "enterprise",
        configuredMode: "plan_default",
        configuredExtension: "201",
      }),
    ).toMatchObject({ action: "transfer", destination: "201", mode: "on_call" })
    expect(
      resolveSupportHandoff({
        humanHelpRequired: true,
        afterHours: true,
        plan: "professional",
        configuredMode: "plan_default",
        configuredExtension: null,
      }),
    ).toMatchObject({ action: "record_message", mode: "voicemail" })
  })

  it("rispetta una deroga commerciale per il tenant", () => {
    expect(resolveAfterHoursMode("free", "on_call")).toBe("on_call")
  })
})
