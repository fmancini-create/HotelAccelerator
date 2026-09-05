import { type NextRequest, NextResponse } from "next/server"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || (product.key !== "hotelaccelerator" && product.key !== "manubot")) {
    return response({ error: "invalid_product" }, 400)
  }

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return response({ error: "registry_not_configured" }, 503)
  if (!auth.ok) return response({ error: "unauthorized" }, 401)

  const body = (await request.json().catch(() => null)) as {
    externalTenantId?: unknown
    tenantName?: unknown
  } | null
  const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
  const tenantName = typeof body?.tenantName === "string" ? body.tenantName.trim() : ""
  if (!externalTenantId || !tenantName) return response({ error: "invalid_request" }, 400)

  const sb = createServiceClient()
  let customerAccountId: string | null = null

  if (product.key === "hotelaccelerator") {
    const { data: account, error } = await sb
      .from("customer_accounts")
      .select("id")
      .eq("property_id", externalTenantId)
      .maybeSingle()
    if (error) throw error
    customerAccountId = account?.id ?? null
  } else {
    const { data: link, error } = await sb
      .from("suite_tenant_links")
      .select("customer_account_id")
      .eq("product_key", product.key)
      .eq("external_tenant_id", externalTenantId)
      .maybeSingle()
    if (error) throw error
    customerAccountId = link?.customer_account_id ?? null
  }

  if (!customerAccountId) return response({ error: "customer_account_not_linked" }, 404)

  const { data: existing, error: existingError } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", customerAccountId)
    .eq("product_key", "santaddeo")
    .maybeSingle()
  if (existingError) throw existingError
  if (existing?.external_tenant_id) {
    return response({ santaddeoHotelId: existing.external_tenant_id, provisioned: false })
  }

  const provisionKey = process.env.REVIEWS_FEDERATION_PROVISION_KEY?.trim()
  const santaddeoBase = process.env.SANTADDEO_APP_URL?.trim() || "https://www.santaddeo.com"
  if (!provisionKey) return response({ error: "reviews_provisioning_not_configured" }, 503)

  const provision = await fetch(`${santaddeoBase}/api/integrations/reviews/federated/provision`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-4BID-Reviews-Provision-Key": provisionKey,
    },
    body: JSON.stringify({ workspaceKey: customerAccountId, tenantName }),
  })
  const provisionBody = (await provision.json().catch(() => null)) as { hotelId?: string; error?: string } | null
  if (!provision.ok || !provisionBody?.hotelId) {
    console.error("[reviews-workspace] Santaddeo provisioning failed", {
      product: product.key,
      externalTenantId,
      status: provision.status,
      error: provisionBody?.error ?? "unknown",
    })
    return response({ error: "reviews_workspace_provision_failed" }, 502)
  }

  const { error: linkError } = await sb.from("suite_tenant_links").insert({
    customer_account_id: customerAccountId,
    product_key: "santaddeo",
    external_tenant_id: provisionBody.hotelId,
  })
  if (linkError && linkError.code !== "23505") throw linkError

  return response({ santaddeoHotelId: provisionBody.hotelId, provisioned: true })
}
