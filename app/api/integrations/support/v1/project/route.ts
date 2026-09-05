import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { projectFederatedSupport } from "@/lib/support-federation/core"
import { SUPPORT_ATTACHMENT_MAX_BYTES, SUPPORT_ATTACHMENT_MAX_FILES } from "@/lib/support-attachments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const attachmentSchema = z.object({
  id: z.string().trim().min(1).max(240),
  name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(160),
  size_bytes: z.number().int().positive().max(SUPPORT_ATTACHMENT_MAX_BYTES),
  source_url: z.string().url().max(3000),
})

const bodySchema = z.object({
  tenant_ref: z.string().trim().min(1).max(160),
  thread_id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(240),
  kind: z.enum(["human_support", "suggestion", "bug"]),
  status: z.enum(["open", "closed"]).optional(),
  source_path: z.string().trim().max(500).nullable().optional(),
  reporter: z.object({
    user_id: z.string().trim().max(200).nullable().optional(),
    name: z.string().trim().max(200).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
  }).nullable().optional(),
  messages: z.array(z.object({
    id: z.string().trim().min(1).max(240),
    sender: z.enum(["customer", "agent", "system"]),
    content: z.string().min(1).max(50000),
    created_at: z.string().datetime().nullable().optional(),
    sender_name: z.string().trim().max(160).nullable().optional(),
    sender_email: z.string().trim().email().max(320).nullable().optional(),
    attachments: z.array(attachmentSchema).max(SUPPORT_ATTACHMENT_MAX_FILES).optional(),
  })).max(200),
})

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

  const parsed = bodySchema.safeParse(await readBody(request))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

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
