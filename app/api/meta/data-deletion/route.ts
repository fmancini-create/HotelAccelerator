import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { getPlatformWhatsAppConfig } from "@/lib/whatsapp/platform"

/**
 * Meta "Data Deletion Request" callback.
 *
 * Configured in the Meta App dashboard as the "User Data Deletion" callback
 * URL. When a user removes the app from their Facebook/WhatsApp account, Meta
 * sends a POST with a `signed_request` field (base64url(payload).hmac-sha256,
 * signed with the App Secret). We must:
 *   1. verify the signature with META_APP_SECRET,
 *   2. kick off deletion of that user's data,
 *   3. respond with JSON { url, confirmation_code } so the user can track it.
 *
 * Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

function parseSignedRequest(signedRequest: string, appSecret: string): { user_id?: string } | null {
  const parts = signedRequest.split(".")
  if (parts.length !== 2) return null
  const [encodedSig, encodedPayload] = parts

  const expectedSig = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest()
  const providedSig = base64UrlDecode(encodedSig)

  // timing-safe compare (lengths must match first)
  if (expectedSig.length !== providedSig.length || !crypto.timingSafeEqual(expectedSig, providedSig)) {
    return null
  }

  try {
    return JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"))
  } catch {
    return null
  }
}

function baseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`
  ).replace(/\/$/, "")
}

export async function POST(req: NextRequest) {
  const { appSecret } = getPlatformWhatsAppConfig()
  if (!appSecret) {
    return NextResponse.json({ error: "Data deletion non configurata" }, { status: 503 })
  }

  // Meta sends application/x-www-form-urlencoded with a `signed_request` field.
  let signedRequest = ""
  try {
    const contentType = req.headers.get("content-type") || ""
    if (contentType.includes("application/json")) {
      const body = await req.json()
      signedRequest = body?.signed_request || ""
    } else {
      const form = await req.formData()
      signedRequest = String(form.get("signed_request") || "")
    }
  } catch {
    // fall through to error below
  }

  if (!signedRequest) {
    return NextResponse.json({ error: "signed_request mancante" }, { status: 400 })
  }

  const payload = parseSignedRequest(signedRequest, appSecret)
  if (!payload) {
    return NextResponse.json({ error: "Firma non valida" }, { status: 401 })
  }

  // Confirmation code the user can quote to track their request. We embed the
  // (opaque) Meta user id so support can correlate without exposing PII.
  const userRef = payload.user_id ? payload.user_id.slice(-8) : "anon"
  const confirmationCode = `HA-DEL-${userRef}-${Date.now().toString(36)}`.toUpperCase()

  console.log("[v0] Meta data deletion request received", { user: payload.user_id, confirmationCode })

  // NOTE: actual erasure is handled out-of-band (support ticket / scheduled
  // job) since WhatsApp message data is keyed by phone number, not Meta user
  // id. The status page documents the process and SLA.

  const url = `${baseUrl(req)}/data-deletion?code=${encodeURIComponent(confirmationCode)}`

  return NextResponse.json({ url, confirmation_code: confirmationCode })
}

// Some Meta tooling probes the URL with GET; return a friendly redirect target.
export async function GET(req: NextRequest) {
  return NextResponse.redirect(`${baseUrl(req)}/data-deletion`)
}
