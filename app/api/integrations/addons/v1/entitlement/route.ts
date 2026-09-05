import { type NextRequest, NextResponse } from "next/server"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import {
  getSuiteAddonEntitlement,
  isSuiteAddonKey,
  isSuiteAddonStatus,
  resolveSuiteCustomerAccountId,
  setSuiteAddonEntitlementSource,
} from "@/lib/suite-addons/entitlements"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function authenticate(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product) return { error: response({ error: "invalid_product" }, 400) } as const

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return { error: response({ error: "registry_not_configured" }, 503) } as const
  if (!auth.ok) return { error: response({ error: "unauthorized" }, 401) } as const
  return { product } as const
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if ("error" in auth) return auth.error

    const externalTenantId = request.nextUrl.searchParams.get("externalTenantId")?.trim() || ""
    const addonKey = request.nextUrl.searchParams.get("addonKey")?.trim().toLowerCase() || ""
    if (!externalTenantId || !isSuiteAddonKey(addonKey)) {
      return response({ error: "invalid_request" }, 400)
    }

    const customerAccountId = await resolveSuiteCustomerAccountId({
      productKey: auth.product.key,
      externalTenantId,
    })
    if (!customerAccountId) return response({ error: "customer_account_not_linked" }, 404)

    const entitlement = await getSuiteAddonEntitlement({ customerAccountId, addonKey })
    return response({ entitlement })
  } catch (error) {
    console.error("[suite-addons] entitlement read failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "entitlement_read_failed" }, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if ("error" in auth) return auth.error

    const body = (await request.json().catch(() => null)) as {
      externalTenantId?: unknown
      addonKey?: unknown
      status?: unknown
      activatedAt?: unknown
      expiresAt?: unknown
      metadata?: unknown
    } | null

    const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
    const addonKey = typeof body?.addonKey === "string" ? body.addonKey.trim().toLowerCase() : ""
    const status = typeof body?.status === "string" ? body.status.trim().toLowerCase() : ""
    if (!externalTenantId || !isSuiteAddonKey(addonKey) || !isSuiteAddonStatus(status)) {
      return response({ error: "invalid_request" }, 400)
    }

    const activatedAt = typeof body?.activatedAt === "string" ? body.activatedAt : null
    const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt : null
    const metadata = body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined

    const customerAccountId = await resolveSuiteCustomerAccountId({
      productKey: auth.product.key,
      externalTenantId,
    })
    if (!customerAccountId) return response({ error: "customer_account_not_linked" }, 404)

    const entitlement = await setSuiteAddonEntitlementSource({
      customerAccountId,
      addonKey,
      sourceProductKey: auth.product.key,
      sourceExternalTenantId: externalTenantId,
      status,
      activatedAt,
      expiresAt,
      metadata,
    })

    return response({ success: true, entitlement })
  } catch (error) {
    console.error("[suite-addons] entitlement write failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "entitlement_write_failed" }, 500)
  }
}
