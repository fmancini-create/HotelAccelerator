import { type NextRequest, NextResponse } from "next/server"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { ensureReviewsWorkspace, ReviewsFederationError } from "@/lib/reviews/federation"

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

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: product.key,
      externalTenantId,
      tenantName,
      origin: product.key === "manubot" ? "manubot" : "hotelaccelerator",
    })
    return response({
      santaddeoHotelId: workspace.santaddeoHotelId,
      provisioned: workspace.provisioned,
    })
  } catch (error) {
    if (error instanceof ReviewsFederationError) {
      return response({ error: error.code }, error.status)
    }
    console.error("[reviews-workspace] unexpected error", {
      product: product.key,
      externalTenantId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "reviews_workspace_failed" }, 500)
  }
}
