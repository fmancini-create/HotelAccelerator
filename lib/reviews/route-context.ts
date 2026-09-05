import "server-only"

import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
import { ensureReviewsWorkspace, ReviewsFederationError } from "@/lib/reviews/federation"

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function resolveNativeReviewsContext(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return { error: json({ error: "unauthorized" }, 401) }
  if (!identity.isTenantAdmin && !identity.isSuperAdmin) return { error: json({ error: "forbidden" }, 403) }

  const sb = createServiceClient()
  if (!(await isModuleActive(sb, identity.propertyId, "reviews"))) {
    return { error: json({ error: "reviews_not_active" }, 403) }
  }

  const { data: property, error } = await sb
    .from("properties")
    .select("id,name")
    .eq("id", identity.propertyId)
    .maybeSingle()
  if (error) return { error: json({ error: "property_read_failed" }, 500) }
  if (!property) return { error: json({ error: "property_not_found" }, 404) }

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: "hotelaccelerator",
      externalTenantId: property.id,
      tenantName: property.name,
      origin: "hotelaccelerator",
    })
    return { workspace, property, identity, error: null }
  } catch (error) {
    if (error instanceof ReviewsFederationError) {
      return { error: json({ error: error.code }, error.status) }
    }
    console.error("[reviews] native context failed", {
      propertyId: identity.propertyId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return { error: json({ error: "reviews_context_failed" }, 500) }
  }
}

export async function resolveManubotCoreReviewsContext(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || product.key !== "manubot") return { error: json({ error: "invalid_product" }, 400) }

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return { error: json({ error: "registry_not_configured" }, 503) }
  if (!auth.ok) return { error: json({ error: "unauthorized" }, 401) }

  const externalTenantId = request.nextUrl.searchParams.get("externalTenantId")?.trim() || ""
  const tenantName = request.nextUrl.searchParams.get("tenantName")?.trim() || ""
  if (!externalTenantId || !tenantName) return { error: json({ error: "invalid_request" }, 400) }

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: "manubot",
      externalTenantId,
      tenantName,
      origin: "manubot",
    })
    return { workspace, externalTenantId, tenantName, error: null }
  } catch (error) {
    if (error instanceof ReviewsFederationError) {
      return { error: json({ error: error.code }, error.status) }
    }
    console.error("[reviews-core] ManuBot context failed", {
      externalTenantId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return { error: json({ error: "reviews_context_failed" }, 500) }
  }
}
