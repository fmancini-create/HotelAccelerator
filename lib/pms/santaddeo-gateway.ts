import "server-only"

const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context")

type VercelRequestContextReader = { get?: () => { headers?: Record<string, string | undefined> } | undefined }

export class SantaddeoPmsGatewayError extends Error {
  constructor(public readonly code: string, public readonly status: number, message = code) {
    super(message)
    this.name = "SantaddeoPmsGatewayError"
  }
}

function requestScopedVercelOidcToken(): string | null {
  if (process.env.VERCEL !== "1") return null
  try {
    const runtime = globalThis as unknown as Record<symbol, unknown>
    const reader = runtime[VERCEL_REQUEST_CONTEXT_SYMBOL] as VercelRequestContextReader | undefined
    return reader?.get?.()?.headers?.["x-vercel-oidc-token"]?.trim() || null
  } catch {
    return null
  }
}

function authHeaders() {
  const headers: Record<string, string> = {}
  const oidc = requestScopedVercelOidcToken()
  if (oidc) headers.Authorization = `Bearer ${oidc}`
  const key = process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT?.trim()
  if (key) headers["X-4BID-Registry-Key"] = key
  if (!oidc && !key) throw new SantaddeoPmsGatewayError("pms_gateway_auth_missing", 503)
  return headers
}

function baseUrl() {
  return process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com"
}

async function get(path: string, hotelId: string, query?: URLSearchParams) {
  const url = new URL(path, baseUrl())
  url.searchParams.set("hotel_id", hotelId)
  query?.forEach((value, key) => {
    if (key !== "hotel_id") url.searchParams.set(key, value)
  })

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: authHeaders(),
  })
  const payload = await response.json().catch(() => ({ error: "invalid_upstream_response" }))
  if (!response.ok) {
    throw new SantaddeoPmsGatewayError(
      typeof payload?.error === "string" ? payload.error : "pms_gateway_upstream_error",
      response.status >= 500 ? 502 : response.status,
    )
  }
  return payload
}

export function getSantaddeoPmsCapabilities(hotelId: string) {
  return get("/api/integrations/pms/v1/capabilities", hotelId)
}

export function getSantaddeoPmsReservations(hotelId: string, query?: URLSearchParams) {
  return get("/api/integrations/pms/v1/reservations", hotelId, query)
}
