import { createSign, generateKeyPairSync } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { verificaNotificaPubSub } from "@/lib/email/pubsub-verify"

const AUDIENCE = "https://www.hotelaccelerator.com/api/channels/email/webhook/gmail"
const SERVICE_ACCOUNT = "hotelaccelerator-pubsub@hotelaccelerator.iam.gserviceaccount.com"
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const TEST_JWK = {
  ...TEST_PUBLIC_KEY.export({ format: "jwk" }),
  kid: "test-key",
  kty: "RSA",
  alg: "RS256",
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url")
}

function signedToken(overrides: Record<string, unknown> = {}) {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "test-key" }))
  const payload = base64Url(
    JSON.stringify({
      aud: AUDIENCE,
      iss: "https://accounts.google.com",
      email: SERVICE_ACCOUNT,
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 60,
      ...overrides,
    }),
  )
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  signer.end()
  return {
    token: `${header}.${payload}.${signer.sign(TEST_PRIVATE_KEY).toString("base64url")}`,
    jwk: TEST_JWK,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("verificaNotificaPubSub", () => {
  it("rejects a request without the Pub/Sub bearer token", async () => {
    await expect(verificaNotificaPubSub(new Request(AUDIENCE))).resolves.toMatchObject({
      stato: "assente",
    })
  })

  it("accepts only the configured, signed Pub/Sub service account", async () => {
    const { token, jwk } = signedToken()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=3600" } }),
    )

    await expect(
      verificaNotificaPubSub(new Request(AUDIENCE, { headers: { authorization: `Bearer ${token}` } })),
    ).resolves.toMatchObject({ stato: "valida", email: SERVICE_ACCOUNT, aud: AUDIENCE })
  })

  it("rejects a signed token issued for another service account", async () => {
    const { token, jwk } = signedToken({ email: "other-project@iam.gserviceaccount.com" })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=0" } }),
    )

    await expect(
      verificaNotificaPubSub(new Request(AUDIENCE, { headers: { authorization: `Bearer ${token}` } })),
    ).resolves.toMatchObject({ stato: "non_valida", motivo: "account di servizio inatteso" })
  })
})
