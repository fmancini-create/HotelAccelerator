import { type NextRequest, NextResponse } from "next/server"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import {
  ensureReviewsWorkspace,
  forwardReviewsConfig,
  ReviewsFederationError,
} from "@/lib/reviews/federation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function authorize(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || product.key !== "manubot") {
    return { error: response({ error: "invalid_product" }, 400) } as const
  }

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return { error: response({ error: "registry_not_configured" }, 503) } as const
  if (!auth.ok) return { error: response({ error: "unauthorized" }, 401) } as const

  const externalTenantId = request.nextUrl.searchParams.get("externalTenantId")?.trim() || ""
  const tenantName = request.nextUrl.searchParams.get("tenantName")?.trim() || ""
  if (!externalTenantId || !tenantName) {
    return { error: response({ error: "invalid_request" }, 400) } as const
  }

  return { externalTenantId, tenantName } as const
}

async function handle(request: NextRequest, method: "GET" | "PATCH") {
  const auth = await authorize(request)
  if ("error" in auth) return auth.error

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: "manubot",
      externalTenantId: auth.externalTenantId,
      tenantName: auth.tenantName,
      origin: "manubot",
    })

    const upstream = await forwardReviewsConfig({
      hotelId: workspace.santaddeoHotelId,
      method,
      origin: "manubot",
      ...(method === "PATCH" ? { body: await request.text() } : {}),
    })
    return response(upstream.payload, upstream.status)
  } catch (error) {
    if (error instanceof ReviewsFederationError) {
      return response({ error: error.code }, error.status)
    }
    console.error("[reviews-core] ManuBot configuration proxy failed", {
      externalTenantId: auth.externalTenantId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "reviews_config_failed" }, 500)
  }
}

export async function GET(request: NextRequest) {
  return handle(request, "GET")
}

export async function PATCH(request: NextRequest) {
  return handle(request, "PATCH")
}
