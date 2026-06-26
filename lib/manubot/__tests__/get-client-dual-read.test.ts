import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest"

// `@/lib/crypto/secrets` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let getManubotClient: typeof import("../../manubot").getManubotClient
let encryptManubotPasswordForWrite: typeof import("../credential-secrets").encryptManubotPasswordForWrite

// Cattura l'ultima password inviata al login Manubot, senza loggarla.
let lastLoginPassword: string | null = null
let lastLoginEmail: string | null = null

beforeAll(async () => {
  // Chiave deterministica e finta per i test (32 byte base64).
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  // Env richieste dal client (valori fittizi: nessuna rete reale, fetch è mockata).
  process.env.MANUBOT_SUPABASE_URL = "https://fake-manubot.supabase.co"
  process.env.MANUBOT_SUPABASE_ANON_KEY = "fake-anon-key"
  process.env.MANUBOT_BASE_URL = "https://manubot.it/api"
  process.env.MANUBOT_DEFAULT_EMAIL = "default@manubot.test"
  process.env.MANUBOT_DEFAULT_PASSWORD = "default-env-password"

  const mod = await import("../../manubot")
  getManubotClient = mod.getManubotClient
  const secrets = await import("../credential-secrets")
  encryptManubotPasswordForWrite = secrets.encryptManubotPasswordForWrite
})

beforeEach(() => {
  lastLoginPassword = null
  lastLoginEmail = null
  // Mock fetch: intercetta la POST di login e restituisce un access_token finto.
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {}
    lastLoginEmail = body.email ?? null
    lastLoginPassword = body.password ?? null
    return {
      ok: true,
      json: async () => ({ access_token: "fake-jwt", expires_at: Date.now() / 1000 + 3600 }),
      text: async () => "",
    } as unknown as Response
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getManubotClient — dual-read manubot_password", () => {
  it("dual-read LEGACY: usa la password in chiaro così com'è al login", async () => {
    await getManubotClient({
      manubot_email: "hotel@manubot.test",
      manubot_password: "legacy-plaintext-pwd",
      manubot_supabase_url: "https://fake-manubot.supabase.co",
    })
    expect(lastLoginEmail).toBe("hotel@manubot.test")
    expect(lastLoginPassword).toBe("legacy-plaintext-pwd")
  })

  it("dual-read ENCRYPTED: decifra enc:v1: prima del login", async () => {
    const encrypted = encryptManubotPasswordForWrite("real-secret-pwd")
    expect(encrypted).toMatch(/^enc:v1:/) // assicura che il valore in DB sia cifrato
    await getManubotClient({
      manubot_email: "hotel@manubot.test",
      manubot_password: encrypted,
      manubot_supabase_url: "https://fake-manubot.supabase.co",
    })
    // Al login deve arrivare il PLAINTEXT, non il ciphertext.
    expect(lastLoginPassword).toBe("real-secret-pwd")
    expect(lastLoginPassword).not.toContain("enc:v1:")
  })

  it("fallback ENV: password null/vuota -> usa MANUBOT_DEFAULT_PASSWORD", async () => {
    await getManubotClient({
      manubot_email: null,
      manubot_password: null,
      manubot_supabase_url: null,
    })
    expect(lastLoginEmail).toBe("default@manubot.test")
    expect(lastLoginPassword).toBe("default-env-password")
  })

  it("fallback ENV: stringa vuota -> usa MANUBOT_DEFAULT_PASSWORD", async () => {
    await getManubotClient({
      manubot_email: "hotel@manubot.test",
      manubot_password: "",
      manubot_supabase_url: "https://fake-manubot.supabase.co",
    })
    expect(lastLoginPassword).toBe("default-env-password")
  })
})
