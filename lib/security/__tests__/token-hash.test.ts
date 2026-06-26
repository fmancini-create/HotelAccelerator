import { describe, it, expect, beforeAll, afterEach, vi } from "vitest"

// `@/lib/security/token-hash` importa "server-only", che fa throw in ambiente node (Vitest).
vi.mock("server-only", () => ({}))

let hashApiToken: typeof import("../token-hash").hashApiToken
let isHashedApiToken: typeof import("../token-hash").isHashedApiToken
let tokenMatchesHash: typeof import("../token-hash").tokenMatchesHash

// Secret finto, robusto e deterministico, usato SOLO nei test (32 byte base64).
const FAKE_SECRET = Buffer.alloc(32, 9).toString("base64")

beforeAll(async () => {
  process.env.API_TOKEN_HASH_SECRET = FAKE_SECRET
  const mod = await import("../token-hash")
  hashApiToken = mod.hashApiToken
  isHashedApiToken = mod.isHashedApiToken
  tokenMatchesHash = mod.tokenMatchesHash
})

afterEach(() => {
  // Ripristina il secret in caso un test lo abbia rimosso.
  process.env.API_TOKEN_HASH_SECRET = FAKE_SECRET
})

describe("token-hash — hashApiToken", () => {
  it("è deterministico: stesso token + stesso secret => stesso hash", () => {
    expect(hashApiToken("tok_abc123")).toBe(hashApiToken("tok_abc123"))
  })

  it("token diversi producono hash diversi", () => {
    expect(hashApiToken("tok_aaa")).not.toBe(hashApiToken("tok_bbb"))
  })

  it("output ha prefisso hmac:v1: e non contiene il token", () => {
    const h = hashApiToken("super-secret-token")
    expect(h.startsWith("hmac:v1:")).toBe(true)
    expect(h).not.toContain("super-secret-token")
    // hmac:v1: + 64 hex char
    expect(h).toMatch(/^hmac:v1:[0-9a-f]{64}$/)
  })

  it("lancia errore controllato se il secret manca (senza stampare valori)", () => {
    delete process.env.API_TOKEN_HASH_SECRET
    expect(() => hashApiToken("tok")).toThrowError(/API_TOKEN_HASH_SECRET non impostata/)
  })

  it("token vuoto/non valido lancia senza produrre hash", () => {
    expect(() => hashApiToken("")).toThrowError(/stringa non vuota/)
    // @ts-expect-error test runtime: input non stringa
    expect(() => hashApiToken(null)).toThrowError(/stringa non vuota/)
  })
})

describe("token-hash — isHashedApiToken", () => {
  it("true su hmac:v1:...", () => {
    expect(isHashedApiToken(hashApiToken("x"))).toBe(true)
    expect(isHashedApiToken("hmac:v1:deadbeef")).toBe(true)
  })

  it("false su token plain, null, undefined, non-stringa", () => {
    expect(isHashedApiToken("plain-token")).toBe(false)
    expect(isHashedApiToken(null)).toBe(false)
    expect(isHashedApiToken(undefined)).toBe(false)
    expect(isHashedApiToken(123)).toBe(false)
    expect(isHashedApiToken("enc:v1:abc")).toBe(false)
  })
})

describe("token-hash — tokenMatchesHash", () => {
  it("token corretto + hash corretto => true", () => {
    const token = "tok_match_me"
    expect(tokenMatchesHash(token, hashApiToken(token))).toBe(true)
  })

  it("token sbagliato + hash corretto => false", () => {
    expect(tokenMatchesHash("tok_wrong", hashApiToken("tok_right"))).toBe(false)
  })

  it("hash mancante o non valido => false", () => {
    expect(tokenMatchesHash("tok", null)).toBe(false)
    expect(tokenMatchesHash("tok", undefined)).toBe(false)
    expect(tokenMatchesHash("tok", "plain-not-hashed")).toBe(false)
  })

  it("token vuoto => false senza lanciare", () => {
    expect(tokenMatchesHash("", hashApiToken("tok"))).toBe(false)
  })
})

describe("token-hash — nessun log di token/hash/secret", () => {
  it("hashApiToken e tokenMatchesHash non scrivono su console", () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "info").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
    ]
    const token = "tok_no_logs"
    const h = hashApiToken(token)
    tokenMatchesHash(token, h)
    tokenMatchesHash("wrong", h)
    for (const s of spies) {
      expect(s).not.toHaveBeenCalled()
      s.mockRestore()
    }
  })
})
