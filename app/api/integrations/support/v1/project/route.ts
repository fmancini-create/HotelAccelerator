import { type NextRequest, NextResponse } from "next/server"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { projectFederatedSupport } from "@/lib/support-federation/core"
import { federatedSupportProjectionSchema } from "@/lib/support-federation/contract"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function readBody(request: NextRequest) {
  const text = await request.text()
  if (text.length > 1_000_000) return null
  try { return JSON.parse(text) } catch { return null }
}

export async function POST(request: NextRequest) {
  const product = getSuiteProduct(request.headers.get("x-4bid-product"))
  if (!product || !["santaddeo", "hotelprofitai"].includes(product.key)) {
    return NextResponse.json({ error: "invalid_product" }, { status: 400 })
  }

  const auth = await authenticateRegistryClient(
    product.key,
    request.headers.get("x-4bid-registry-key"),
    request.headers.get("authorization"),
  )
  if (!auth.configured) return NextResponse.json({ error: "integration_not_configured" }, { status: 503 })
  if (!auth.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const parsed = federatedSupportProjectionSchema.safeParse(await readBody(request))
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
    }))
    console.warn("[support-federation] invalid projection payload", {
      product: product.key,
      issues,
    })
    return NextResponse.json({ error: "invalid_request", issues }, { status: 400 })
  }

  try {
    const result = await projectFederatedSupport({
      product: product.key as "santaddeo" | "hotelprofitai",
      tenantRef: parsed.data.tenant_ref,
      threadId: parsed.data.thread_id,
      title: parsed.data.title,
      kind: parsed.data.kind,
      status: parsed.data.status,
      sourcePath: parsed.data.source_path,
      reporter: parsed.data.reporter,
      messages: parsed.data.messages,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })
    return NextResponse.json({ ok: true, conversation_id: result.conversationId, customer_code: result.customerCode })
  } catch (error) {
    console.error("[support-federation] projection failed", { product: product.key, error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
