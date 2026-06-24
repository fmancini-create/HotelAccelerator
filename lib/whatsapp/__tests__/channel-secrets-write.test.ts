import { describe, it, expect, beforeAll, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let encryptWhatsAppCredentialsForWrite: typeof import("../channel-secrets").encryptWhatsAppCredentialsForWrite
let decryptWhatsAppCredentials: typeof import("../channel-secrets").decryptWhatsAppCredentials

// Controllo locale del formato cifrato (evita import diretto di crypto/secrets).
const isEncryptedSecret = (v: unknown): boolean => typeof v === "string" && v.startsWith("enc:v1:")

beforeAll(async () => {
  // Chiave deterministica e finta per i test (32 byte base64).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64")
  const mod = await import("../channel-secrets")
  encryptWhatsAppCredentialsForWrite = mod.encryptWhatsAppCredentialsForWrite
  decryptWhatsAppCredentials = mod.decryptWhatsAppCredentials
})

/**
 * Questi test riproducono la logica di costruzione `credentials` usata dai due
 * writer (route POST manuale + embedded-signup), che si appoggiano entrambi a
 * encryptWhatsAppCredentialsForWrite. Verificano cifratura, merge/preserve,
 * partial update, idempotenza, isolamento di `config` e round-trip dual-read.
 */
describe("WhatsApp writer write-encrypt", () => {
  it("H) writer manuale: i tre segreti in chiaro vengono salvati come enc:v1:", () => {
    const incoming = {
      access_token: "EAAG-real-token",
      app_secret: "app-secret-xyz",
      verify_token: "verify-123",
    }
    const payload = encryptWhatsAppCredentialsForWrite(incoming)
    expect(isEncryptedSecret(payload!.access_token)).toBe(true)
    expect(isEncryptedSecret(payload!.app_secret)).toBe(true)
    expect(isEncryptedSecret(payload!.verify_token)).toBe(true)
    // Nessun plaintext residuo.
    expect(payload!.access_token).not.toContain("EAAG-real-token")
  })

  it("I) embedded signup: oggetto costruito da zero -> tutti enc:v1:", () => {
    const credentials = encryptWhatsAppCredentialsForWrite({
      access_token: "system-user-token",
      app_secret: "platform-app-secret",
      verify_token: "platform-verify",
    })
    expect(isEncryptedSecret(credentials!.access_token)).toBe(true)
    expect(isEncryptedSecret(credentials!.app_secret)).toBe(true)
    expect(isEncryptedSecret(credentials!.verify_token)).toBe(true)
  })

  it("F) merge: i segreti esistenti vengono preservati quando non arrivano nuovi valori", () => {
    // Simula esattamente il merge della route POST: esistente + soli campi nuovi.
    const existing = {
      access_token: "enc:v1:existing-access",
      app_secret: "enc:v1:existing-secret",
      verify_token: "legacy-plain-verify",
    }
    const incomingSecrets: Record<string, unknown> = {} // nessun campo inviato
    const merged = { ...existing, ...encryptWhatsAppCredentialsForWrite(incomingSecrets) }
    expect(merged.access_token).toBe("enc:v1:existing-access")
    expect(merged.app_secret).toBe("enc:v1:existing-secret")
    expect(merged.verify_token).toBe("legacy-plain-verify")
  })

  it("J) partial update: solo access_token nuovo -> cifra solo quello, gli altri restano", () => {
    const existing = {
      access_token: "enc:v1:old-access",
      app_secret: "enc:v1:old-secret",
      verify_token: "enc:v1:old-verify",
    }
    const incomingSecrets = { access_token: "brand-new-token" }
    const merged = { ...existing, ...encryptWhatsAppCredentialsForWrite(incomingSecrets) }
    // access_token aggiornato e cifrato
    expect(isEncryptedSecret(merged.access_token)).toBe(true)
    expect(merged.access_token).not.toBe("enc:v1:old-access")
    // gli altri due NON toccati
    expect(merged.app_secret).toBe("enc:v1:old-secret")
    expect(merged.verify_token).toBe("enc:v1:old-verify")
  })

  it("G) idempotenza: un valore già enc:v1: non viene ricifrato", () => {
    const incoming = { access_token: "enc:v1:already-encrypted" }
    const payload = encryptWhatsAppCredentialsForWrite(incoming)
    expect(payload!.access_token).toBe("enc:v1:already-encrypted")
  })

  it("K) round-trip: dopo write-encrypt il dual-read restituisce il plaintext", () => {
    const incoming = {
      access_token: "round-trip-token",
      app_secret: "round-trip-secret",
      verify_token: "round-trip-verify",
    }
    const written = encryptWhatsAppCredentialsForWrite(incoming)
    const readBack = decryptWhatsAppCredentials(written)
    expect(readBack!.access_token).toBe("round-trip-token")
    expect(readBack!.app_secret).toBe("round-trip-secret")
    expect(readBack!.verify_token).toBe("round-trip-verify")
  })

  it("E) config non viene toccato: campi non segreti restano invariati e in chiaro", () => {
    // Replica un merge dove credentials contiene per errore anche chiavi non segrete.
    const incoming = {
      access_token: "tok",
      // questi NON sono nella lista segreti -> devono restare identici
      phone_number_id: "123456789",
      waba_id: "987654321",
    }
    const payload = encryptWhatsAppCredentialsForWrite(incoming) as Record<string, unknown>
    expect(isEncryptedSecret(payload.access_token)).toBe(true)
    expect(payload.phone_number_id).toBe("123456789")
    expect(payload.waba_id).toBe("987654321")
  })
})
