import { describe, it, expect, beforeAll, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let decryptWhatsAppCredentials: typeof import("../channel-secrets").decryptWhatsAppCredentials
let encryptWhatsAppCredentialsForWrite: typeof import("../channel-secrets").encryptWhatsAppCredentialsForWrite
let hasEncryptedWhatsAppCredentials: typeof import("../channel-secrets").hasEncryptedWhatsAppCredentials
let encryptSecret: typeof import("@/lib/crypto/secrets").encryptSecret
let isEncryptedSecret: typeof import("@/lib/crypto/secrets").isEncryptedSecret

beforeAll(async () => {
  // Chiave deterministica e finta per i test (32 byte base64).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64")
  const mod = await import("../channel-secrets")
  decryptWhatsAppCredentials = mod.decryptWhatsAppCredentials
  encryptWhatsAppCredentialsForWrite = mod.encryptWhatsAppCredentialsForWrite
  hasEncryptedWhatsAppCredentials = mod.hasEncryptedWhatsAppCredentials
  const crypto = await import("@/lib/crypto/secrets")
  encryptSecret = crypto.encryptSecret
  isEncryptedSecret = crypto.isEncryptedSecret
})

describe("decryptWhatsAppCredentials", () => {
  it("1) lascia invariati i valori legacy in chiaro", () => {
    const creds = {
      access_token: "plain-access",
      app_secret: "plain-app",
      verify_token: "plain-verify",
      phone_number_id: "123456",
    }
    const out = decryptWhatsAppCredentials(creds)
    expect(out.access_token).toBe("plain-access")
    expect(out.app_secret).toBe("plain-app")
    expect(out.verify_token).toBe("plain-verify")
    // campo non segreto invariato
    expect(out.phone_number_id).toBe("123456")
  })

  it("decifra i valori cifrati enc:v1:", () => {
    const enc = encryptSecret("super-segreto")!
    expect(enc.startsWith("enc:v1:")).toBe(true)
    const out = decryptWhatsAppCredentials({ access_token: enc })
    expect(out.access_token).toBe("super-segreto")
  })

  it("6) gestisce null e undefined senza crash", () => {
    expect(decryptWhatsAppCredentials(null)).toBeNull()
    expect(decryptWhatsAppCredentials(undefined)).toBeUndefined()
    const out = decryptWhatsAppCredentials({ access_token: null, app_secret: undefined })
    expect(out.access_token).toBeNull()
    expect(out.app_secret).toBeNull()
  })

  it("non aggiunge campi segreti non presenti", () => {
    const out = decryptWhatsAppCredentials({ phone_number_id: "999" })
    expect("access_token" in out).toBe(false)
    expect("app_secret" in out).toBe(false)
    expect("verify_token" in out).toBe(false)
  })
})

describe("encryptWhatsAppCredentialsForWrite", () => {
  it("2/3) cifra i tre campi in enc:v1: e fa round-trip col dual-read", () => {
    const original = {
      access_token: "ACCESS-123",
      app_secret: "APPSECRET-456",
      verify_token: "VERIFY-789",
      phone_number_id: "111",
      waba_id: "222",
      display_phone_number: "+39 055 000",
    }
    const payload = encryptWhatsAppCredentialsForWrite(original)
    // 2) Encrypt: tutti e tre cifrati
    expect(isEncryptedSecret(payload.access_token)).toBe(true)
    expect(isEncryptedSecret(payload.app_secret)).toBe(true)
    expect(isEncryptedSecret(payload.verify_token)).toBe(true)
    // 7) campi non segreti invariati e NON cifrati
    expect(payload.phone_number_id).toBe("111")
    expect(payload.waba_id).toBe("222")
    expect(payload.display_phone_number).toBe("+39 055 000")
    expect(isEncryptedSecret(payload.phone_number_id)).toBe(false)
    // 3) Round-trip: encrypt -> decrypt
    const back = decryptWhatsAppCredentials(payload)
    expect(back.access_token).toBe("ACCESS-123")
    expect(back.app_secret).toBe("APPSECRET-456")
    expect(back.verify_token).toBe("VERIFY-789")
  })

  it("4) idempotenza: un valore già enc:v1: non viene ricifrato", () => {
    const enc = encryptSecret("ACCESS-IDEMP")!
    const payload = encryptWhatsAppCredentialsForWrite({ access_token: enc, app_secret: "APP-1" })
    expect(payload.access_token).toBe(enc)
    expect(isEncryptedSecret(payload.app_secret)).toBe(true)
    expect(decryptWhatsAppCredentials(payload).access_token).toBe("ACCESS-IDEMP")
  })

  it("5) partial update: cifra solo le chiavi presenti, non aggiunge le altre", () => {
    const payload = encryptWhatsAppCredentialsForWrite({ access_token: "ONLY-ACCESS" })
    expect(isEncryptedSecret(payload.access_token)).toBe(true)
    expect("app_secret" in payload).toBe(false)
    expect("verify_token" in payload).toBe(false)
  })

  it("F) chiave undefined rimossa, null e stringa vuota diventano null", () => {
    const payload = encryptWhatsAppCredentialsForWrite({
      access_token: undefined,
      app_secret: null,
      verify_token: "",
      phone_number_id: "keep",
    })
    expect("access_token" in payload).toBe(false)
    expect(payload.app_secret).toBeNull()
    expect(payload.verify_token).toBeNull()
    expect(payload.phone_number_id).toBe("keep")
  })

  it("6) null/undefined come credentials sono gestiti senza crash", () => {
    expect(encryptWhatsAppCredentialsForWrite(null)).toBeNull()
    expect(encryptWhatsAppCredentialsForWrite(undefined)).toBeUndefined()
  })

  it("non muta l'oggetto credentials originale", () => {
    const original = { access_token: "ACCESS-X" }
    encryptWhatsAppCredentialsForWrite(original)
    expect(original.access_token).toBe("ACCESS-X")
  })

  it("8) lista mixed (legacy / già cifrato / null) gestita correttamente via map", () => {
    const enc = encryptSecret("gia-cifrato")!
    const rows: Array<Record<string, unknown>> = [
      { access_token: "legacy" },
      { access_token: enc },
      { access_token: null },
    ]
    const written = rows.map(encryptWhatsAppCredentialsForWrite)
    expect(isEncryptedSecret(written[0].access_token)).toBe(true) // legacy -> cifrato
    expect(written[1].access_token).toBe(enc) // già cifrato -> invariato
    expect(written[2].access_token).toBeNull() // null -> null
    // dual-read coerente
    const read = written.map(decryptWhatsAppCredentials)
    expect(read[0].access_token).toBe("legacy")
    expect(read[1].access_token).toBe("gia-cifrato")
    expect(read[2].access_token).toBeNull()
  })
})

describe("hasEncryptedWhatsAppCredentials", () => {
  it("rileva la presenza di almeno un segreto cifrato", () => {
    expect(hasEncryptedWhatsAppCredentials(null)).toBe(false)
    expect(hasEncryptedWhatsAppCredentials({ access_token: "plain" })).toBe(false)
    expect(hasEncryptedWhatsAppCredentials({ access_token: encryptSecret("x")! })).toBe(true)
  })
})

describe("9) nessun log di segreti", () => {
  it("le funzioni non scrivono su console", () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ]
    const enc = encryptWhatsAppCredentialsForWrite({
      access_token: "SECRET-A",
      app_secret: "SECRET-B",
      verify_token: "SECRET-C",
    })
    decryptWhatsAppCredentials(enc)
    for (const s of spies) {
      expect(s).not.toHaveBeenCalled()
      s.mockRestore()
    }
  })
})
