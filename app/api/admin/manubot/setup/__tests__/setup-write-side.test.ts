import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Test write-side della FASE A: il setup ManuBot deve fare DUAL-WRITE di
 * api_token (in chiaro) + api_token_hash (hmac:v1). Webhook NON toccato.
 *
 * Mockiamo: server-only, auth gate, service client (cattura payload update),
 * env, e fetch (login + company_id). hashApiToken usa una secret di test.
 */

vi.mock("server-only", () => ({}))

// Cattura del payload passato a .update()
const updateCapture: { payload: Record<string, unknown> | null } = { payload: null }

vi.mock("@/lib/auth/admin-access", () => ({
  requireTenantAdmin: vi.fn().mockResolvedValue({ id: "admin-1" }),
  isAccessError: () => false,
  accessErrorStatus: () => 403,
}))

vi.mock("@/lib/supabase/server", () => {
  const eq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn((payload: Record<string, unknown>) => {
    updateCapture.payload = payload
    return { eq }
  })
  // select(...).or(...).limit(...) -> property trovata
  const limit = vi.fn().mockResolvedValue({
    data: [{ id: "prop-1", name: "Villa I Barronci", slug: "villa-i-barronci" }],
  })
  const or = vi.fn(() => ({ limit }))
  const select = vi.fn(() => ({ or }))
  const from = vi.fn(() => ({ select, update }))
  return { createServiceClient: () => ({ from }) }
})

const PASSWORD = "manubot-secret-password"

beforeEach(() => {
  updateCapture.payload = null
  vi.unstubAllEnvs()
  vi.stubEnv("API_TOKEN_HASH_SECRET", "test-hash-secret-32-bytes-minimum-length!!")
  vi.stubEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
  vi.stubEnv("MANUBOT_SUPABASE_URL", "https://manubot.example.co")
  vi.stubEnv("MANUBOT_SUPABASE_ANON_KEY", "anon-key")
  vi.stubEnv("MANUBOT_DEFAULT_EMAIL", "owner@example.com")
  vi.stubEnv("MANUBOT_DEFAULT_PASSWORD", PASSWORD)
  vi.stubEnv("MANUBOT_BASE_URL", "https://manubot.example.co/api")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com")

  // fetch: 1) login OK con access_token; 2) /companies con match
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/auth/v1/token")) {
      return new Response(JSON.stringify({ access_token: "jwt-abc", expires_at: 9999999999 }), { status: 200 })
    }
    if (url.includes("/rest/v1/profiles")) {
      return new Response(JSON.stringify([{ active_company_id: "company-123" }]), { status: 200 })
    }
    return new Response(JSON.stringify([]), { status: 200 })
  })
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch)
})

async function callSetup() {
  const { GET } = await import("@/app/api/admin/manubot/setup/route")
  const req = new Request("https://app.example.com/api/admin/manubot/setup") as never
  const res = await GET(req)
  return res.json()
}

describe("ManuBot setup — DUAL-WRITE api_token_hash (FASE A)", () => {
  it("l'update include api_token_hash con prefisso hmac:v1: corrispondente a hashApiToken(api_token)", async () => {
    const body = await callSetup()
    expect(body.success).toBe(true)

    const payload = updateCapture.payload!
    expect(payload).toBeTruthy()

    const apiToken = payload.api_token as string
    const apiTokenHash = payload.api_token_hash as string

    expect(typeof apiToken).toBe("string")
    expect(apiToken.length).toBe(64) // randomBytes(32).hex
    expect(typeof apiTokenHash).toBe("string")
    expect(apiTokenHash.startsWith("hmac:v1:")).toBe(true)

    // Coerenza: il valore salvato è esattamente hashApiToken(apiToken)
    const { hashApiToken } = await import("@/lib/security/token-hash")
    expect(apiTokenHash).toBe(hashApiToken(apiToken))
  })

  it("api_token resta IN CHIARO: non cifrato (no enc:v1:) e non svuotato", async () => {
    await callSetup()
    const payload = updateCapture.payload!
    const apiToken = payload.api_token as string
    expect(apiToken).toBeTruthy()
    expect(apiToken.startsWith("enc:v1:")).toBe(false)
    expect(/^[0-9a-f]{64}$/.test(apiToken)).toBe(true)
  })

  it("manubot_password resta cifrata (enc:v1:) e diversa dal plaintext", async () => {
    await callSetup()
    const payload = updateCapture.payload!
    const pwd = payload.manubot_password as string
    expect(pwd.startsWith("enc:v1:")).toBe(true)
    expect(pwd).not.toBe(PASSWORD)
  })

  it("la response include api_token e NON include api_token_hash", async () => {
    const body = await callSetup()
    expect(typeof body.api_token).toBe("string")
    expect("api_token_hash" in body).toBe(false)
    // instructions continuano a mostrare il token come oggi
    expect(JSON.stringify(body.instructions)).toContain(body.api_token)
  })

  it("fallisce in modo controllato se API_TOKEN_HASH_SECRET manca (nessun token/hash nel messaggio)", async () => {
    vi.stubEnv("API_TOKEN_HASH_SECRET", "")
    const body = await callSetup()
    // Errore controllato 500 con messaggio generico, nessun update eseguito
    expect(body.error).toBeTruthy()
    expect(updateCapture.payload).toBeNull()
    expect(String(body.error)).not.toMatch(/hmac:v1:/)
  })
})
