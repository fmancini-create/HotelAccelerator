import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import {
  getSuiteManubotTaskFormData,
  type SuiteTaskSourceProduct,
} from "@/lib/manubot/suite-task-hub"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function caller(request: NextRequest): Promise<
  | { ok: true; product: SuiteTaskSourceProduct }
  | { ok: false; status: number; error: string }
> {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || !["santaddeo", "hotelprofitai"].includes(product.key)) {
    return { ok: false, status: 400, error: "invalid_product" }
  }

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return { ok: false, status: 503, error: "registry_not_configured" }
  if (!auth.ok) return { ok: false, status: 401, error: "unauthorized" }
  return { ok: true, product: product.key as SuiteTaskSourceProduct }
}

export async function POST(request: NextRequest) {
  const auth = await caller(request)
  if (!auth.ok) return json({ error: auth.error }, auth.status)
  const sourceProduct = auth.product

  const body = (await request.json().catch(() => null)) as { external_tenant_id?: unknown } | null
  const externalTenantId = typeof body?.external_tenant_id === "string" ? body.external_tenant_id.trim() : ""
  if (!externalTenantId) return json({ error: "invalid_external_tenant_id" }, 400)

  try {
    const result = await getSuiteManubotTaskFormData(sourceProduct, externalTenantId)
    if (!result) return json({ error: "suite_customer_not_linked" }, 404)

    return json({
      addon: "manubot",
      status: result.context.status,
      active: result.context.active,
      reason: result.context.reason,
      activation_url: result.context.activationUrl,
      task_data: result.taskData,
    })
  } catch (error) {
    console.error("[suite-manubot] context failed", {
      sourceProduct,
      error: error instanceof Error ? error.message : "unknown",
    })
    return json({ error: "manubot_context_unavailable" }, 502)
  }
}
