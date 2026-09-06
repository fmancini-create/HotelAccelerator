import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import {
  ensureReviewsWorkspace,
  forwardReviewBookingCandidates,
  ReviewsFederationError,
} from "@/lib/reviews/federation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || product.key !== "manubot") return response({ error: "invalid_product" }, 400)

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return response({ error: "registry_not_configured" }, 503)
  if (!auth.ok) return response({ error: "unauthorized" }, 401)

  const externalTenantId = request.nextUrl.searchParams.get("externalTenantId")?.trim() || ""
  const tenantName = request.nextUrl.searchParams.get("tenantName")?.trim() || ""
  if (!externalTenantId || !tenantName) return response({ error: "invalid_request" }, 400)

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: "manubot",
      externalTenantId,
      tenantName,
      origin: "manubot",
    })
    const upstream = await forwardReviewBookingCandidates({
      hotelId: workspace.santaddeoHotelId,
      origin: "manubot",
      query: request.nextUrl.searchParams,
    })
    return response(upstream.payload, upstream.status)
  } catch (error) {
    if (error instanceof ReviewsFederationError) return response({ error: error.code }, error.status)
    console.error("[reviews-core] ManuBot booking candidates proxy failed", {
      externalTenantId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "review_booking_candidates_failed" }, 500)
  }
}
