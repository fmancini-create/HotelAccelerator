import { describe, it, expect, beforeAll, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let decryptManubotPassword: typeof import("../credential-secrets").decryptManubotPassword
let encryptManubotPasswordForWrite: typeof import("../credential-secrets").encryptManubotPasswordForWrite
let decryptManubotCredentials: typeof import("../credential-secrets").decryptManubotCredentials
let encryptManubotCredentialsForWrite: typeof import("../credential-secrets").encryptManubotCredentialsForWrite
let hasEncryptedManubotPassword: typeof import("../credential-secrets").hasEncryptedManubotPassword

// Controllo locale del formato cifrato (evita import diretto di crypto/secrets).
const isEnc = (v: unknown): boolean => typeof v === "string" && v.startsWith("enc:v1:")

beforeAll(async () => {
  // Chiave deterministica e finta per i test (32 byte base64).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  const mod = await import("../credential-secrets")
  decryptManubotPassword = mod.decryptManubotPassword
  encryptManubotPasswordForWrite = mod.encryptManubotPasswordForWrite
  decryptManubotCredentials = mod.decryptManubotCredentials
  encryptManubotCredentialsForWrite = mod.encryptManubotCredentialsForWrite
  hasEncryptedManubotPassword = mod.hasEncryptedManubotPassword
})

describe("manubot credential-secrets — valore scalare", () => {
  it("cifra un valore in chiaro in formato enc:v1:", () => {
    const enc = encryptManubotPasswordForWrite("super-secret-pwd")
    expect(isEnc(enc)).toBe(true)
    expect(enc).not.toContain("super-secret-pwd")
  })

  it("round-trip: encrypt -> decrypt restituisce l'originale", () => {
    const enc = encryptManubotPasswordForWrite("p@ssw0rd-123")
    expect(decryptManubotPassword(enc)).toBe("p@ssw0rd-123")
  })

  it("dual-read: legacy in chiaro restituito invariato", () => {
    expect(decryptManubotPassword("legacy-plain")).toBe("legacy-plain")
  })

  it("idempotenza: cifrare due volte non ri-cifra", () => {
    const once = encryptManubotPasswordForWrite("abc")
    const twice = encryptManubotPasswordForWrite(once)
    expect(twice).toBe(once)
    expect(decryptManubotPassword(twice)).toBe("abc")
  })

  it("null / undefined / stringa vuota -> null", () => {
    expect(encryptManubotPasswordForWrite(null)).toBeNull()
    expect(encryptManubotPasswordForWrite(undefined)).toBeNull()
    expect(encryptManubotPasswordForWrite("")).toBeNull()
    expect(decryptManubotPassword(null)).toBeNull()
    expect(decryptManubotPassword(undefined)).toBeNull()
    expect(decryptManubotPassword("")).toBeNull()
  })
})

describe("manubot credential-secrets — livello oggetto", () => {
  it("cifra solo manubot_password, lascia invariati gli altri campi", () => {
    const out = encryptManubotCredentialsForWrite({
      manubot_email: "hotel@example.com",
      manubot_password: "the-pwd",
      manubot_supabase_url: "https://x.supabase.co",
      manubot_company_id: "comp_123",
      api_token: "tok_should_not_be_touched",
    })
    expect(isEnc((out as Record<string, unknown>).manubot_password)).toBe(true)
    expect((out as Record<string, unknown>).manubot_email).toBe("hotel@example.com")
    expect((out as Record<string, unknown>).manubot_supabase_url).toBe("https://x.supabase.co")
    expect((out as Record<string, unknown>).manubot_company_id).toBe("comp_123")
    // api_token NON deve mai essere cifrato da questo helper.
    expect((out as Record<string, unknown>).api_token).toBe("tok_should_not_be_touched")
  })

  it("round-trip a livello oggetto", () => {
    const enc = encryptManubotCredentialsForWrite({ manubot_password: "round" })
    const dec = decryptManubotCredentials(enc)
    expect((dec as Record<string, unknown>).manubot_password).toBe("round")
  })

  it("partial update: chiave assente resta assente", () => {
    const out = encryptManubotCredentialsForWrite({ manubot_email: "only-email@example.com" }) as Record<
      string,
      unknown
    >
    expect("manubot_password" in out).toBe(false)
    expect(out.manubot_email).toBe("only-email@example.com")
  })

  it("partial update: chiave undefined viene rimossa", () => {
    const out = encryptManubotCredentialsForWrite({ manubot_password: undefined }) as Record<string, unknown>
    expect("manubot_password" in out).toBe(false)
  })

  it("dual-read oggetto: legacy in chiaro passthrough", () => {
    const dec = decryptManubotCredentials({ manubot_password: "legacy" }) as Record<string, unknown>
    expect(dec.manubot_password).toBe("legacy")
  })

  it("null / undefined property -> invariato senza crash", () => {
    expect(decryptManubotCredentials(null)).toBeNull()
    expect(decryptManubotCredentials(undefined)).toBeUndefined()
    expect(encryptManubotCredentialsForWrite(null)).toBeNull()
    expect(encryptManubotCredentialsForWrite(undefined)).toBeUndefined()
  })

  it("hasEncryptedManubotPassword distingue cifrato/legacy/assente", () => {
    const enc = encryptManubotCredentialsForWrite({ manubot_password: "x" })
    expect(hasEncryptedManubotPassword(enc)).toBe(true)
    expect(hasEncryptedManubotPassword({ manubot_password: "plain" })).toBe(false)
    expect(hasEncryptedManubotPassword({ manubot_email: "a@b.c" })).toBe(false)
    expect(hasEncryptedManubotPassword(null)).toBe(false)
  })

  it("non muta l'input originale", () => {
    const input = { manubot_password: "orig" }
    encryptManubotCredentialsForWrite(input)
    expect(input.manubot_password).toBe("orig")
  })
})
