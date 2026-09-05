import { describe, expect, it } from "vitest"

import {
  isRealSuiteDirectoryEmail,
  isSuitePlaceholderEmail,
  resolveSuiteActivationEmail,
} from "@/lib/suite-identity/directory-email"

describe("suite directory email guard", () => {
  it("recognizes WhatsApp and Telegram placeholder emails", () => {
    expect(isSuitePlaceholderEmail("bot+wa_393471234567@manubot.it")).toBe(true)
    expect(isSuitePlaceholderEmail("BOT+TG_12345@MANUBOT.IT")).toBe(true)
    expect(isSuitePlaceholderEmail("mario@example.com")).toBe(false)
  })

  it("never treats a ManuBot placeholder as a real email", () => {
    expect(isRealSuiteDirectoryEmail("bot+wa_393471234567@manubot.it")).toBe(false)
    expect(isRealSuiteDirectoryEmail("mario.rossi@example.com")).toBe(true)
  })

  it("keeps a real source email and ignores an override", () => {
    expect(resolveSuiteActivationEmail({
      sourceEmail: " Mario.Rossi@Example.com ",
      requestedEmail: "wrong@example.com",
    })).toEqual({
      ok: true,
      email: "mario.rossi@example.com",
      replaceSourceEmail: false,
    })
  })

  it("requires a real email for placeholder users", () => {
    expect(resolveSuiteActivationEmail({
      sourceEmail: "bot+wa_393471234567@manubot.it",
    })).toEqual({ ok: false, code: "real_email_required" })
  })

  it("rejects another placeholder as the replacement email", () => {
    expect(resolveSuiteActivationEmail({
      sourceEmail: "bot+wa_393471234567@manubot.it",
      requestedEmail: "bot+tg_999@manubot.it",
    })).toEqual({ ok: false, code: "invalid_real_email" })
  })

  it("accepts and normalizes a real replacement email", () => {
    expect(resolveSuiteActivationEmail({
      sourceEmail: "bot+wa_393471234567@manubot.it",
      requestedEmail: " Mario.Rossi@Example.com ",
    })).toEqual({
      ok: true,
      email: "mario.rossi@example.com",
      replaceSourceEmail: true,
    })
  })
})
