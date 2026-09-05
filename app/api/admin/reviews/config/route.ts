import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function ensureCentralReviewsActive(base: string, provisionKey: string, hotelId: string) {
  const res = await fetch(`${base}/api/integrations/reviews/federated/activate`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "X-4BID-Reviews-Provision-Key": provisionKey },
    body: JSON.stringify({ hotelId }),
  })
  if (!res.ok) throw new Error(`reviews_activation_failed_${res.status}`)
}

async function context(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return { error: response({ error: "unauthorized" }, 401) } as const
  if (!identity.isTenantAdmin && !identity.isSuperAdmin) return { error: response({ error: "forbidden" }, 403) } as const

  const sb = createServiceClient()
  if (!(await isModuleActive(sb, identity.propertyId, "reviews"))) {
    return { error: response({ error: "reviews_not_active" }, 403) } as const
  }

  const [{ data: property }, { data: account }] = await Promise.all([
    sb.from("properties").select("id,name").eq("id", identity.propertyId).maybeSingle(),
    sb.from("customer_accounts").select("id").eq("property_id", identity.propertyId).maybeSingle(),
  ])
  if (!property || !account) return { error: response({ error: "suite_account_not_configured" }, 409) } as const

  const provisionKey = process.env.REVIEWS_FEDERATION_PROVISION_KEY?.trim()
  const santaddeoBase = process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com"
  if (!provisionKey) return { error: response({ error: "reviews_provisioning_not_configured" }, 503) } as const

  let { data: link } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", account.id)
    .eq("product_key", "santaddeo")
    .maybeSingle()

  if (!link?.external_tenant_id) {
    const provision = await fetch(`${santaddeoBase}/api/integrations/reviews/federated/provision`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-4BID-Reviews-Provision-Key": provisionKey },
      body: JSON.stringify({ workspaceKey: account.id, tenantName: property.name }),
    })
    const body = (await provision.json().catch(() => null)) as { hotelId?: string } | null
    if (!provision.ok || !body?.hotelId) return { error: response({ error: "reviews_workspace_provision_failed" }, 502) } as const

    const { error: linkError } = await sb.from("suite_tenant_links").insert({
      customer_account_id: account.id,
      product_key: "santaddeo",
      external_tenant_id: body.hotelId,
    })
    if (linkError && linkError.code !== "23505") throw linkError
    link = { external_tenant_id: body.hotelId }
  } else {
    try {
      await ensureCentralReviewsActive(santaddeoBase, provisionKey, link.external_tenant_id)
    } catch (error) {
      console.error("[reviews] central activation failed", {
        propertyId: identity.propertyId,
        hotelId: link.external_tenant_id,
        error: error instanceof Error ? error.message : "unknown",
      })
      return { error: response({ error: "reviews_workspace_activation_failed" }, 502) } as const
    }
  }

  const key = process.env.REVIEWS_FEDERATION_KEY_HA?.trim()
  if (!key) return { error: response({ error: "reviews_federation_not_configured" }, 503) } as const
  return { hotelId: link.external_tenant_id, key } as const
}

async function forward(request: NextRequest, method: "GET" | "PATCH") {
  const ctx = await context(request)
  if ("error" in ctx) return ctx.error

  const base = process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com"
  const upstream = await fetch(`${base}/api/integrations/reviews/federated/config?hotelId=${encodeURIComponent(ctx.hotelId)}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-4BID-Origin": "hotelaccelerator",
      "X-4BID-Reviews-Key": ctx.key,
    },
    ...(method === "PATCH" ? { body: await request.text() } : {}),
  })
  const body = await upstream.json().catch(() => ({ error: "invalid_upstream_response" }))
  return response(body, upstream.status)
}

export async function GET(request: NextRequest) {
  return forward(request, "GET")
}

export async function PATCH(request: NextRequest) {
  return forward(request, "PATCH")
}
