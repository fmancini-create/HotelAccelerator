import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import type { SuiteProductKey } from "@/lib/customer-codes/product"

const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context")

export type ReviewsOrigin = "hotelaccelerator" | "manubot"
type ReviewsSourceProduct = Extract<SuiteProductKey, "hotelaccelerator" | "manubot">

type VercelRequestContext = {
  headers?: Record<string, string | undefined>
}

type VercelRequestContextReader = {
  get?: () => VercelRequestContext | undefined
}

export class ReviewsFederationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message)
    this.name = "ReviewsFederationError"
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

function santaddeoAuthHeaders(origin: ReviewsOrigin): Record<string, string> {
  const headers: Record<string, string> = { "X-4BID-Origin": origin }
  const oidc = requestScopedVercelOidcToken()
  if (oidc) headers.Authorization = `Bearer ${oidc}`

  // OIDC e' la credenziale primaria in produzione. Inviamo anche la registry
  // key esistente, quando configurata, cosi' Santaddeo puo' usarla come fallback
  // in preview/recovery dopo aver rifiutato intenzionalmente un token non-prod.
  const key = process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT?.trim()
  if (key) headers["X-4BID-Registry-Key"] = key

  if (!oidc && !key) {
    throw new ReviewsFederationError(
      "reviews_federation_auth_missing",
      503,
      "Autenticazione interna Santaddeo non disponibile",
    )
  }

  return headers
}

function santaddeoBaseUrl() {
  return process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com"
}

async function resolveCustomerAccountId(productKey: ReviewsSourceProduct, externalTenantId: string) {
  const sb = createServiceClient()

  if (productKey === "hotelaccelerator") {
    const { data, error } = await sb
      .from("customer_accounts")
      .select("id")
      .eq("property_id", externalTenantId)
      .maybeSingle()
    if (error) throw error
    return data?.id as string | undefined
  }

  const { data, error } = await sb
    .from("suite_tenant_links")
    .select("customer_account_id")
    .eq("product_key", "manubot")
    .eq("external_tenant_id", externalTenantId)
    .maybeSingle()
  if (error) throw error
  return data?.customer_account_id as string | undefined
}

async function activateSantaddeoWorkspace(hotelId: string, origin: ReviewsOrigin) {
  const upstream = await fetch(`${santaddeoBaseUrl()}/api/integrations/reviews/federated/activate`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      ...santaddeoAuthHeaders(origin),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hotelId }),
  })

  if (!upstream.ok) {
    const payload = (await upstream.json().catch(() => null)) as { error?: string } | null
    throw new ReviewsFederationError(
      payload?.error || "reviews_workspace_activation_failed",
      upstream.status >= 500 ? 502 : upstream.status,
    )
  }
}

export async function ensureReviewsWorkspace(input: {
  productKey: ReviewsSourceProduct
  externalTenantId: string
  tenantName: string
  origin?: ReviewsOrigin
}) {
  const externalTenantId = input.externalTenantId.trim()
  const tenantName = input.tenantName.trim()
  if (!externalTenantId || !tenantName) {
    throw new ReviewsFederationError("invalid_request", 400)
  }

  const customerAccountId = await resolveCustomerAccountId(input.productKey, externalTenantId)
  if (!customerAccountId) {
    throw new ReviewsFederationError("customer_account_not_linked", 404)
  }

  const origin = input.origin ?? (input.productKey === "manubot" ? "manubot" : "hotelaccelerator")
  const sb = createServiceClient()
  const { data: existing, error: existingError } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", "santaddeo")
    .maybeSingle()
  if (existingError) throw existingError

  if (existing?.external_tenant_id) {
    await activateSantaddeoWorkspace(existing.external_tenant_id, origin)
    return {
      customerAccountId,
      santaddeoHotelId: existing.external_tenant_id as string,
      provisioned: false,
    }
  }

  const provision = await fetch(`${santaddeoBaseUrl()}/api/integrations/reviews/federated/provision`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      ...santaddeoAuthHeaders(origin),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaceKey: customerAccountId, tenantName }),
  })
  const payload = (await provision.json().catch(() => null)) as { hotelId?: string; error?: string } | null
  if (!provision.ok || !payload?.hotelId) {
    throw new ReviewsFederationError(
      payload?.error || "reviews_workspace_provision_failed",
      provision.status >= 500 ? 502 : provision.status,
    )
  }

  const { error: insertError } = await sb.from("suite_tenant_links").insert({
    customer_account_id: customerAccountId,
    product_key: "santaddeo",
    external_tenant_id: payload.hotelId,
  })

  if (!insertError) {
    return {
      customerAccountId,
      santaddeoHotelId: payload.hotelId,
      provisioned: true,
    }
  }

  if (insertError.code !== "23505") throw insertError

  // Un'altra richiesta puo' aver creato il link nello stesso istante. In quel
  // caso il mapping di suite vince sempre sul workspace appena provisionato.
  const { data: raced, error: racedError } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", "santaddeo")
    .maybeSingle()
  if (racedError) throw racedError
  if (!raced?.external_tenant_id) {
    throw new ReviewsFederationError("reviews_workspace_link_failed", 500)
  }

  await activateSantaddeoWorkspace(raced.external_tenant_id, origin)
  return {
    customerAccountId,
    santaddeoHotelId: raced.external_tenant_id as string,
    provisioned: false,
  }
}

export async function forwardReviewsConfig(input: {
  hotelId: string
  method: "GET" | "PATCH"
  origin: ReviewsOrigin
  body?: string
}) {
  const url = new URL("/api/integrations/reviews/federated/config", santaddeoBaseUrl())
  url.searchParams.set("hotelId", input.hotelId)

  const upstream = await fetch(url, {
    method: input.method,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      ...santaddeoAuthHeaders(input.origin),
      "Content-Type": "application/json",
    },
    ...(input.method === "PATCH" ? { body: input.body ?? "{}" } : {}),
  })

  const payload = await upstream.json().catch(() => ({ error: "invalid_upstream_response" }))
  return { status: upstream.status, payload }
}
