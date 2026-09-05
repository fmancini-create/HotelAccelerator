import "server-only"

import { SUITE_SSO_CONFIG } from "@/lib/suite-sso/config"
import { SuiteIdentityError } from "@/lib/suite-identity/registry"

const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context")

type VercelRequestContext = {
  headers?: Record<string, string | undefined>
}

type VercelRequestContextReader = {
  get?: () => VercelRequestContext | undefined
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

function manubotAuthHeaders() {
  const oidc = requestScopedVercelOidcToken()
  if (oidc) return { Authorization: `Bearer ${oidc}` }

  const key = process.env.CUSTOMER_CODE_REGISTRY_KEY_MB?.trim()
  if (key) return { "X-4BID-Registry-Key": key }

  throw new SuiteIdentityError(
    "manubot_directory_auth_missing",
    503,
    "Autenticazione interna ManuBot non disponibile",
  )
}

export async function replaceManuBotPlaceholderEmail(input: {
  externalTenantId: string
  externalUserId: string
  email: string
}) {
  const url = new URL(
    `/api/integrations/hotelaccelerator/v1/users/${encodeURIComponent(input.externalUserId)}/email`,
    SUITE_SSO_CONFIG.manubot.baseUrl,
  )
  url.searchParams.set("tenant_id", input.externalTenantId)

  let response: Response
  try {
    response = await fetch(url, {
      method: "PATCH",
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
      headers: {
        ...manubotAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: input.email }),
    })
  } catch {
    throw new SuiteIdentityError(
      "manubot_email_update_unavailable",
      503,
      "ManuBot non è raggiungibile: riprova tra poco",
    )
  }

  const payload = await response.json().catch(() => null) as { error?: string; email?: string } | null
  if (!response.ok) {
    throw new SuiteIdentityError(
      "manubot_email_update_failed",
      response.status === 409 ? 409 : response.status >= 500 ? 503 : 400,
      payload?.error || "Aggiornamento email ManuBot non riuscito",
    )
  }

  return payload?.email?.trim().toLowerCase() || input.email
}
