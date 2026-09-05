import { type NextRequest, NextResponse } from "next/server"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { resolveSuiteCustomerAccountId } from "@/lib/suite-addons/entitlements"
import { getReviewsBillingProfile, saveReviewsBillingProfile } from "@/lib/suite-addons/reviews-billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function authenticate(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || (product.key !== "manubot" && product.key !== "hotelaccelerator")) {
    return { error: response({ error: "invalid_product" }, 400) } as const
  }
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
  const auth = await authenticate(request)
  if ("error" in auth) return auth.error
  const externalTenantId = request.nextUrl.searchParams.get("externalTenantId")?.trim() || ""
  if (!externalTenantId) return response({ error: "invalid_request" }, 400)
  try {
    const customerAccountId = await resolveSuiteCustomerAccountId({ productKey: auth.product.key, externalTenantId })
    if (!customerAccountId) return response({ error: "customer_account_not_linked" }, 404)
    return response({ profile: await getReviewsBillingProfile(customerAccountId) })
  } catch (error) {
    console.error("[suite-addons] reviews billing read failed", error)
    return response({ error: "billing_read_failed" }, 500)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticate(request)
  if ("error" in auth) return auth.error
  const body = (await request.json().catch(() => null)) as { externalTenantId?: unknown; accommodationCount?: unknown } | null
  const externalTenantId = typeof body?.externalTenantId === "string" ? body.externalTenantId.trim() : ""
  const accommodationCount = Number(body?.accommodationCount)
  if (!externalTenantId || !Number.isInteger(accommodationCount)) return response({ error: "invalid_request" }, 400)
  try {
    const saved = await saveReviewsBillingProfile({
      productKey: auth.product.key,
      externalTenantId,
      accommodationCount,
    })
    return response({ success: true, profile: { accommodationCount: saved.accommodationCount, confirmedAt: saved.confirmedAt } })
  } catch (error) {
    const code = error instanceof Error ? error.message : "billing_write_failed"
    return response({ error: code }, code === "customer_account_not_linked" ? 404 : code === "invalid_accommodation_count" ? 400 : 500)
  }
}
