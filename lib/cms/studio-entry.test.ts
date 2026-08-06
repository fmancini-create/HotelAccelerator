import { describe, expect, it } from "vitest"
import { shouldResumeBuilder } from "@/lib/cms/studio-entry"

describe("CMS studio entry", () => {
  it("riapre l'editor quando esiste una bozza builder salvata", () => {
    expect(shouldResumeBuilder({ has_builder_draft: true })).toBe(true)
  })

  it("mostra la configurazione al primo accesso", () => {
    expect(shouldResumeBuilder(null)).toBe(false)
    expect(shouldResumeBuilder({ has_builder_draft: false })).toBe(false)
  })

  it("consente di aprire esplicitamente la configurazione senza perdere la bozza", () => {
    expect(shouldResumeBuilder({ has_builder_draft: true }, "?setup=1")).toBe(false)
  })
})
