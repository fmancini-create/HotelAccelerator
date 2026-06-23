import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// `server-only` lancia se importato fuori da un Server Component; in ambiente
// test (node) lo neutralizziamo per poter testare la utility.
vi.mock("server-only", () => ({}))

import {
  isEncryptedSecret,
  encryptSecret,
  decryptSecret,
  decryptSecretIfNeeded,
} from "../secrets"

// Chiave di test deterministica (32 byte in base64). NON è una chiave reale.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64")

describe("lib/crypto/secrets", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY
  })

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY
  })

  it("1. encryptSecret produce una stringa con prefisso enc:v1:", () => {
    const out = encryptSecret("secret")
    expect(out).toMatch(/^enc:v1:/)
  })

  it("2. decryptSecret(encryptSecret(x)) === x (round-trip)", () => {
    const enc = encryptSecret("secret")
    expect(decryptSecret(enc)).toBe("secret")
  })

  it("3. due cifrature dello stesso valore producono ciphertext diversi (IV random)", () => {
    const a = encryptSecret("same-value")
    const b = encryptSecret("same-value")
    expect(a).not.toBe(b)
    // ma entrambe decifrano allo stesso plaintext
    expect(decryptSecret(a)).toBe("same-value")
    expect(decryptSecret(b)).toBe("same-value")
  })

  it("4. decryptSecretIfNeeded restituisce il plain legacy se non cifrato", () => {
    expect(decryptSecretIfNeeded("legacy_plain")).toBe("legacy_plain")
  })

  it("5. isEncryptedSecret riconosce un valore enc:v1:", () => {
    expect(isEncryptedSecret(encryptSecret("x"))).toBe(true)
  })

  it("6. isEncryptedSecret è false su valori in chiaro o non-stringa", () => {
    expect(isEncryptedSecret("plain")).toBe(false)
    expect(isEncryptedSecret(null)).toBe(false)
    expect(isEncryptedSecret(undefined)).toBe(false)
    expect(isEncryptedSecret(123)).toBe(false)
  })

  it("7. chiave mancante => errore chiaro (in cifratura e decifratura)", () => {
    delete process.env.ENCRYPTION_KEY
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY non impostata/)
  })

  it("8. chiave non valida => errore chiaro", () => {
    process.env.ENCRYPTION_KEY = "troppo-corta"
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY non valida/)
  })

  it("gestisce null/undefined/stringa vuota senza crash", () => {
    expect(encryptSecret(null)).toBeNull()
    expect(encryptSecret(undefined)).toBeNull()
    expect(encryptSecret("")).toBeNull()
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret(undefined)).toBeNull()
    expect(decryptSecret("")).toBeNull()
    expect(decryptSecretIfNeeded(null)).toBeNull()
    expect(decryptSecretIfNeeded(undefined)).toBeNull()
    expect(decryptSecretIfNeeded("")).toBeNull()
  })

  it("encryptSecret è idempotente su un valore già cifrato", () => {
    const once = encryptSecret("abc")!
    const twice = encryptSecret(once)
    expect(twice).toBe(once)
  })

  it("decryptSecret lancia su valore non cifrato", () => {
    expect(() => decryptSecret("plain-not-encrypted")).toThrow(/non cifrato/)
  })

  it("decryptSecret rileva manomissioni (auth tag GCM)", () => {
    const enc = encryptSecret("tamper-me")!
    // altero l'ultimo carattere del ciphertext
    const tampered = enc.slice(0, -1) + (enc.slice(-1) === "A" ? "B" : "A")
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it("supporta anche una chiave in formato hex (64 char)", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("hex")
    const enc = encryptSecret("hex-key-value")
    expect(decryptSecret(enc)).toBe("hex-key-value")
  })
})
