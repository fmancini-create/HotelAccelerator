import { describe, it, expect, beforeAll, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let decryptChannelSecrets: typeof import("../channel-secrets").decryptChannelSecrets
let encryptChannelSecretsForWrite: typeof import("../channel-secrets").encryptChannelSecretsForWrite
let encryptSecret: typeof import("@/lib/crypto/secrets").encryptSecret
let isEncryptedSecret: typeof import("@/lib/crypto/secrets").isEncryptedSecret

beforeAll(async () => {
  // Chiave deterministica per i test (32 byte base64).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  decryptChannelSecrets = (await import("../channel-secrets")).decryptChannelSecrets
  encryptChannelSecretsForWrite = (await import("../channel-secrets")).encryptChannelSecretsForWrite
  encryptSecret = (await import("@/lib/crypto/secrets")).encryptSecret
  isEncryptedSecret = (await import("@/lib/crypto/secrets")).isEncryptedSecret
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

describe("encryptChannelSecretsForWrite", () => {
  it("G/H/I) cifra i campi segreti presenti in enc:v1: e fa round-trip col dual-read", () => {
    const payload = encryptChannelSecretsForWrite({
      provider: "gmail",
      email_address: "a@b.it",
      oauth_access_token: "ACCESS-123",
      oauth_refresh_token: "REFRESH-456",
      smtp_password: "SMTP-789",
    })
    // Nel payload destinato al DB i segreti sono cifrati...
    expect(isEncryptedSecret(payload.oauth_access_token)).toBe(true)
    expect(isEncryptedSecret(payload.oauth_refresh_token)).toBe(true)
    expect(isEncryptedSecret(payload.smtp_password)).toBe(true)
    // ...e i campi non segreti restano invariati.
    expect(payload.provider).toBe("gmail")
    expect(payload.email_address).toBe("a@b.it")
    // J) dual-read dopo scrittura cifrata restituisce il chiaro lato server.
    const back = decryptChannelSecrets(payload)
    expect(back.oauth_access_token).toBe("ACCESS-123")
    expect(back.oauth_refresh_token).toBe("REFRESH-456")
    expect(back.smtp_password).toBe("SMTP-789")
  })

  it("F) partial update: una chiave undefined viene rimossa (non sovrascrive l'esistente)", () => {
    const payload = encryptChannelSecretsForWrite({
      oauth_access_token: "ACCESS-1",
      oauth_refresh_token: undefined,
      updated_at: "2026-01-01T00:00:00.000Z",
    })
    expect(isEncryptedSecret(payload.oauth_access_token)).toBe(true)
    expect("oauth_refresh_token" in payload).toBe(false)
    expect(payload.updated_at).toBe("2026-01-01T00:00:00.000Z")
  })

  it("una chiave segreta assente non viene aggiunta", () => {
    const payload = encryptChannelSecretsForWrite({ is_active: true })
    expect("oauth_access_token" in payload).toBe(false)
    expect("oauth_refresh_token" in payload).toBe(false)
    expect("smtp_password" in payload).toBe(false)
    expect(payload.is_active).toBe(true)
  })

  it("null e stringa vuota diventano null (semantica di cancellazione)", () => {
    const payload = encryptChannelSecretsForWrite({
      oauth_access_token: null,
      oauth_refresh_token: "",
    })
    expect(payload.oauth_access_token).toBeNull()
    expect(payload.oauth_refresh_token).toBeNull()
  })

  it("K) idempotente: un valore già enc:v1: non viene ricifrato", () => {
    const enc = encryptSecret("ACCESS-IDEMP")!
    const payload = encryptChannelSecretsForWrite({ oauth_access_token: enc })
    expect(payload.oauth_access_token).toBe(enc)
    expect(decryptChannelSecrets(payload).oauth_access_token).toBe("ACCESS-IDEMP")
  })

  it("non muta il payload originale", () => {
    const original = { oauth_access_token: "ACCESS-X" }
    encryptChannelSecretsForWrite(original)
    expect(original.oauth_access_token).toBe("ACCESS-X")
  })
})
