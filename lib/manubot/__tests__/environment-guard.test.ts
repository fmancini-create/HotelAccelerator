import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// La guard importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

import {
  validateManubotSupabaseUrlForEnvironment,
  isAllowedManubotSupabaseUrl,
  getExpectedManubotSupabaseHost,
  getManubotWebhookPublicUrl,
  isProductionRuntime,
  ManubotEnvironmentError,
  MANUBOT_PROD_SUPABASE_HOST,
  MANUBOT_DEV_SUPABASE_HOST,
  MANUBOT_WEBHOOK_PUBLIC_URL,
} from "../environment-guard"

const PROD_URL = `https://${MANUBOT_PROD_SUPABASE_HOST}`
const DEV_URL = `https://${MANUBOT_DEV_SUPABASE_HOST}`

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function setProduction() {
  vi.stubEnv("VERCEL_ENV", "production")
}

function setPreview() {
  vi.stubEnv("VERCEL_ENV", "preview")
}

describe("environment-guard — rilevamento ambiente", () => {
  it("VERCEL_ENV=production => isProductionRuntime true", () => {
    setProduction()
    expect(isProductionRuntime()).toBe(true)
  })

  it("VERCEL_ENV=preview => isProductionRuntime false", () => {
    setPreview()
    expect(isProductionRuntime()).toBe(false)
  })

  it("VERCEL_ENV assente (dev/test) => isProductionRuntime false", () => {
    expect(isProductionRuntime()).toBe(false)
  })
})

describe("environment-guard — Production consente SOLO host PROD", () => {
  it("1) Production + URL PROD => OK (ritorna host, isAllowed true)", () => {
    setProduction()
    expect(validateManubotSupabaseUrlForEnvironment(PROD_URL)).toBe(MANUBOT_PROD_SUPABASE_HOST)
    expect(isAllowedManubotSupabaseUrl(PROD_URL)).toBe(true)
    expect(getExpectedManubotSupabaseHost()).toBe(MANUBOT_PROD_SUPABASE_HOST)
  })

  it("2) Production + URL DEV => errore controllato MANUBOT_PROD_DEV_MISMATCH", () => {
    setProduction()
    expect(isAllowedManubotSupabaseUrl(DEV_URL)).toBe(false)
    try {
      validateManubotSupabaseUrlForEnvironment(DEV_URL)
      throw new Error("attesa eccezione non lanciata")
    } catch (e) {
      expect(e).toBeInstanceOf(ManubotEnvironmentError)
      expect((e as ManubotEnvironmentError).code).toBe("MANUBOT_PROD_DEV_MISMATCH")
    }
  })

  it("Production + host sconosciuto => MANUBOT_HOST_NOT_ALLOWED", () => {
    setProduction()
    expect(isAllowedManubotSupabaseUrl("https://random.supabase.co")).toBe(false)
    try {
      validateManubotSupabaseUrlForEnvironment("https://random.supabase.co")
      throw new Error("attesa eccezione non lanciata")
    } catch (e) {
      expect((e as ManubotEnvironmentError).code).toBe("MANUBOT_HOST_NOT_ALLOWED")
    }
  })
})

describe("environment-guard — Preview/Development consentono DEV", () => {
  it("3) Preview + URL DEV => OK", () => {
    setPreview()
    expect(validateManubotSupabaseUrlForEnvironment(DEV_URL)).toBe(MANUBOT_DEV_SUPABASE_HOST)
    expect(isAllowedManubotSupabaseUrl(DEV_URL)).toBe(true)
  })

  it("Preview + URL PROD => OK (prod è comunque valido)", () => {
    setPreview()
    expect(validateManubotSupabaseUrlForEnvironment(PROD_URL)).toBe(MANUBOT_PROD_SUPABASE_HOST)
  })

  it("Dev/test (no VERCEL_ENV) + host fittizio valido => OK (nessuna regressione)", () => {
    expect(validateManubotSupabaseUrlForEnvironment("https://fake-manubot.supabase.co")).toBe(
      "fake-manubot.supabase.co",
    )
    expect(isAllowedManubotSupabaseUrl("https://fake-manubot.supabase.co")).toBe(true)
  })
})

describe("environment-guard — URL mancante/malformata", () => {
  it("5) URL mancante (null/empty) => MANUBOT_URL_MISSING", () => {
    for (const bad of [null, undefined, "", "   "]) {
      try {
        validateManubotSupabaseUrlForEnvironment(bad as unknown as string)
        throw new Error("attesa eccezione non lanciata")
      } catch (e) {
        expect((e as ManubotEnvironmentError).code).toBe("MANUBOT_URL_MISSING")
      }
    }
    expect(isAllowedManubotSupabaseUrl(null)).toBe(false)
  })

  it("4) URL malformata => MANUBOT_URL_INVALID", () => {
    try {
      validateManubotSupabaseUrlForEnvironment("not a url")
      throw new Error("attesa eccezione non lanciata")
    } catch (e) {
      expect((e as ManubotEnvironmentError).code).toBe("MANUBOT_URL_INVALID")
    }
    expect(isAllowedManubotSupabaseUrl("not a url")).toBe(false)
  })
})

describe("environment-guard — invariante webhook www", () => {
  it("6) endpoint pubblico usa sempre www", () => {
    expect(getManubotWebhookPublicUrl()).toBe(MANUBOT_WEBHOOK_PUBLIC_URL)
    expect(getManubotWebhookPublicUrl()).toBe("https://www.hotelaccelerator.com/api/external/manubot")
    expect(new URL(getManubotWebhookPublicUrl()).hostname).toBe("www.hotelaccelerator.com")
  })
})

describe("environment-guard — nessun secret nei messaggi d'errore", () => {
  it("7) i messaggi non contengono token/hash/password né URL complete", () => {
    setProduction()
    // URL con path e query che NON deve comparire nel messaggio.
    const urlWithSecrets =
      `${DEV_URL}/rest/v1/x?token=SUPERSECRET&password=PWD123&apikey=hmac:v1:abcdef`
    try {
      validateManubotSupabaseUrlForEnvironment(urlWithSecrets)
      throw new Error("attesa eccezione non lanciata")
    } catch (e) {
      const msg = (e as Error).message
      expect(msg).not.toContain("SUPERSECRET")
      expect(msg).not.toContain("PWD123")
      expect(msg).not.toContain("hmac:v1:")
      expect(msg).not.toContain("token=")
      expect(msg).not.toContain("apikey")
      // Può contenere solo l'host DEV.
      expect(msg).toContain(MANUBOT_DEV_SUPABASE_HOST)
    }
  })
})
