import crypto from "crypto"

/**
 * Verify the X-Hub-Signature-256 header that Meta sends on every webhook POST.
 * The signature is an HMAC-SHA256 of the RAW request body keyed with the app
 * secret, formatted as `sha256=<hex>`.
 *
 * IMPORTANT: pass the raw body string exactly as received (do not re-stringify
 * a parsed object — key ordering/whitespace would change the hash).
 *
 * Returns true when no app secret is configured yet, so first-time setup is not
 * blocked, but logs a warning at the call site responsibility.
 */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | null | undefined,
): boolean {
  // No secret configured -> cannot verify. Caller decides whether to allow.
  if (!appSecret) return true
  if (!signatureHeader) return false

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")

  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Handle the GET verification handshake from Meta when subscribing a webhook.
 * Returns the challenge string to echo back when the verify token matches,
 * otherwise null (caller responds 403).
 */
export function resolveWebhookChallenge(
  params: URLSearchParams,
  expectedVerifyToken: string | null | undefined,
): string | null {
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token")
  const challenge = params.get("hub.challenge")

  if (mode === "subscribe" && token && expectedVerifyToken && token === expectedVerifyToken) {
    return challenge
  }
  return null
}
