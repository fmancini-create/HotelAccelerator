import { describe, expect, it } from "vitest"

import { BrowserConfigValidationError, validaConfigurazioneBrowser } from "@/lib/pms/browser-config"

describe("configurazione browser PMS", () => {
  it("accetta qualunque gestionale HTTPS senza consultare un registro di connettori", () => {
    expect(
      validaConfigurazioneBrowser({
        name: "Gestionale proprietario",
        webUrl: "https://pms.example.test/login?property=42",
        isActive: true,
      }),
    ).toEqual({
      name: "Gestionale proprietario",
      webUrl: "https://pms.example.test/login?property=42",
      isActive: true,
    })
  })

  it("non inventa nome o indirizzo", () => {
    expect(() => validaConfigurazioneBrowser({ name: "", webUrl: "", isActive: true })).toThrow(
      BrowserConfigValidationError,
    )
  })

  it("rifiuta indirizzi non HTTPS e credenziali nell'URL", () => {
    expect(() =>
      validaConfigurazioneBrowser({ name: "PMS", webUrl: "http://pms.example.test", isActive: true }),
    ).toThrow("deve usare https")
    expect(() =>
      validaConfigurazioneBrowser({ name: "PMS", webUrl: "https://user:secret@pms.example.test", isActive: true }),
    ).toThrow("Non inserire username o password")
  })
})
