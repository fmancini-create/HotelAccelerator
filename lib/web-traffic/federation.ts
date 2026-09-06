import "server-only"

import { createServiceClient } from "@/lib/supabase/server"

const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for("@vercel/request-context")

type VercelRequestContext = { headers?: Record<string, string | undefined> }
type VercelRequestContextReader = { get?: () => VercelRequestContext | undefined }

export class WebTrafficFederationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message)
    this.name = "WebTrafficFederationError"
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

function santaddeoAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "X-4BID-Origin": "hotelaccelerator" }
  const oidc = requestScopedVercelOidcToken()
  if (oidc) headers.Authorization = `Bearer ${oidc}`
  const key = process.env.CUSTOMER_CODE_REGISTRY_KEY_SNT?.trim()
  if (key) headers["X-4BID-Registry-Key"] = key
  if (!oidc && !key) throw new WebTrafficFederationError("web_traffic_federation_auth_missing", 503)
  return headers
}

function santaddeoBaseUrl() {
  return process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com"
}

async function activateWorkspace(hotelId: string) {
  const upstream = await fetch(`${santaddeoBaseUrl()}/api/integrations/web-traffic/federated/activate`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { ...santaddeoAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ hotelId }),
  })
  if (!upstream.ok) {
    const payload = (await upstream.json().catch(() => null)) as { error?: string } | null
    throw new WebTrafficFederationError(
      payload?.error || "web_traffic_workspace_activation_failed",
      upstream.status >= 500 ? 502 : upstream.status,
    )
  }
}

export async function ensureWebTrafficWorkspace(input: {
  externalTenantId: string
  tenantName: string
}) {
  const externalTenantId = input.externalTenantId.trim()
  const tenantName = input.tenantName.trim()
  if (!externalTenantId || !tenantName) throw new WebTrafficFederationError("invalid_request", 400)

  const sb = createServiceClient()
  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("id")
    .eq("property_id", externalTenantId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account?.id) throw new WebTrafficFederationError("customer_account_not_linked", 404)

  const { data: existing, error: existingError } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", account.id)
    .eq("product_key", "santaddeo")
    .maybeSingle()
  if (existingError) throw existingError

  if (existing?.external_tenant_id) {
    await activateWorkspace(existing.external_tenant_id as string)
    return { santaddeoHotelId: existing.external_tenant_id as string, mode: "existing" as const }
  }

  const workspaceKey = `hotelaccelerator:${externalTenantId}`
  const provision = await fetch(`${santaddeoBaseUrl()}/api/integrations/web-traffic/federated/provision`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
    headers: { ...santaddeoAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceKey, tenantName }),
  })
  const payload = (await provision.json().catch(() => null)) as { hotelId?: string; error?: string } | null
  if (!provision.ok || !payload?.hotelId) {
    throw new WebTrafficFederationError(
      payload?.error || "web_traffic_workspace_provision_failed",
      provision.status >= 500 ? 502 : provision.status,
    )
  }

  const { error: linkError } = await sb.from("suite_tenant_links").insert({
    customer_account_id: account.id,
    product_key: "santaddeo",
    external_tenant_id: payload.hotelId,
  })
  if (linkError && linkError.code !== "23505") throw linkError

  return { santaddeoHotelId: payload.hotelId, mode: "shared_addons_only" as const }
}

async function forward(path: string, hotelId: string, query?: URLSearchParams) {
  const url = new URL(path, santaddeoBaseUrl())
  url.searchParams.set("hotelId", hotelId)
  if (query?.get("days")) url.searchParams.set("days", query.get("days")!)

  const upstream = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(path.endsWith("/analytics") ? 30_000 : 12_000),
    headers: santaddeoAuthHeaders(),
  })
  const payload = await upstream.json().catch(() => ({ error: "invalid_upstream_response" }))
  return { status: upstream.status, payload }
}

export function forwardWebTrafficSetup(hotelId: string) {
  return forward("/api/integrations/web-traffic/federated/setup", hotelId)
}

export function forwardWebTrafficAnalytics(hotelId: string, query: URLSearchParams) {
  return forward("/api/integrations/web-traffic/federated/analytics", hotelId, query)
}
