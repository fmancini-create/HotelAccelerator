import { describe, it, expect, beforeAll, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let decryptChannelSecrets: typeof import("../channel-secrets").decryptChannelSecrets
let encryptSecret: typeof import("@/lib/crypto/secrets").encryptSecret

beforeAll(async () => {
  // Chiave deterministica per i test (32 byte base64).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  decryptChannelSecrets = (await import("../channel-secrets")).decryptChannelSecrets
  encryptSecret = (await import("@/lib/crypto/secrets")).encryptSecret
})

describe("decryptChannelSecrets", () => {
  it("lascia invariati i valori legacy in chiaro", () => {
    const channel = {
      id: "c1",
      provider: "gmail",
      oauth_access_token: "plain-access",
      oauth_refresh_token: "plain-refresh",
      smtp_password: "plain-smtp",
      email_address: "a@b.it",
    }
    const out = decryptChannelSecrets(channel)
    expect(out.oauth_access_token).toBe("plain-access")
    expect(out.oauth_refresh_token).toBe("plain-refresh")
    expect(out.smtp_password).toBe("plain-smtp")
    // campi non segreti invariati
    expect(out.id).toBe("c1")
    expect(out.email_address).toBe("a@b.it")
  })

  it("decifra i valori cifrati enc:v1:", () => {
    const enc = encryptSecret("super-segreto")!
    expect(enc.startsWith("enc:v1:")).toBe(true)
    const out = decryptChannelSecrets({ id: "c2", oauth_access_token: enc })
    expect(out.oauth_access_token).toBe("super-segreto")
  })

  it("gestisce null/undefined sui campi", () => {
    const out = decryptChannelSecrets({
      id: "c3",
      oauth_access_token: null,
      oauth_refresh_token: undefined,
      smtp_password: null,
    })
    expect(out.oauth_access_token).toBeNull()
    expect(out.oauth_refresh_token).toBeNull()
    expect(out.smtp_password).toBeNull()
  })

  it("ritorna null/undefined invariati se il record è assente", () => {
    expect(decryptChannelSecrets(null)).toBeNull()
    expect(decryptChannelSecrets(undefined)).toBeUndefined()
  })

  it("non aggiunge campi segreti non presenti nel record", () => {
    const out = decryptChannelSecrets({ id: "c4", email_address: "x@y.it" })
    expect("oauth_access_token" in out).toBe(false)
    expect("smtp_password" in out).toBe(false)
  })

  it("gestisce una lista mista (legacy / cifrato / null) via map", () => {
    const enc = encryptSecret("token-cifrato")!
    const rows = [
      { id: "1", oauth_access_token: "legacy" },
      { id: "2", oauth_access_token: enc },
      { id: "3", oauth_access_token: null },
    ]
    const out = rows.map(decryptChannelSecrets)
    expect(out[0].oauth_access_token).toBe("legacy")
    expect(out[1].oauth_access_token).toBe("token-cifrato")
    expect(out[2].oauth_access_token).toBeNull()
  })
})
