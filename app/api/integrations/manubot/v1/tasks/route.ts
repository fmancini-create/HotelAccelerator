import { type NextRequest, NextResponse } from "next/server"

import { authenticateRegistryClient } from "@/lib/customer-codes/registry-auth"
import { getSuiteProduct } from "@/lib/customer-codes/product"
import {
  createSuiteManubotTask,
  getSuiteManubotContext,
  type SuiteTaskSourceProduct,
} from "@/lib/manubot/suite-task-hub"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const PRIORITIES = new Set(["low", "normal", "high", "urgent"])

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

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

export async function POST(request: NextRequest) {
  const auth = await caller(request)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json({ error: "invalid_json" }, 400)

  const externalTenantId = typeof body.external_tenant_id === "string" ? body.external_tenant_id.trim() : ""
  const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : ""
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const priority = typeof body.priority === "string" && PRIORITIES.has(body.priority) ? body.priority : "normal"
  const assignment = body.assignment && typeof body.assignment === "object"
    ? (body.assignment as Record<string, unknown>)
    : {}

  if (!externalTenantId) return json({ error: "invalid_external_tenant_id" }, 400)
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return json({ error: "invalid_idempotency_key" }, 400)
  }
  if (!title || title.length > 240) return json({ error: "invalid_title" }, 400)

  const assigneeIds = strings(assignment.assignee_ids)
  const groupIds = strings(assignment.group_ids)
  if (!assigneeIds.length && !groupIds.length) return json({ error: "responsible_required" }, 400)

  const expectedResolutionMinutes = Number(assignment.expected_resolution_minutes ?? 60)
  if (!Number.isInteger(expectedResolutionMinutes) || expectedResolutionMinutes < 5 || expectedResolutionMinutes > 1440) {
    return json({ error: "invalid_expected_resolution_minutes" }, 400)
  }

  try {
    const context = await getSuiteManubotContext(auth.product, externalTenantId)
    if (!context) return json({ error: "suite_customer_not_linked" }, 404)
    if (!context.active) {
      return json(
        {
          error: context.status === "inactive" ? "addon_inactive" : "addon_configuration_required",
          addon: "manubot",
          status: context.status,
          reason: context.reason,
          activation_url: context.activationUrl,
        },
        context.status === "inactive" ? 403 : 409,
      )
    }

    const created = await createSuiteManubotTask({
      sourceProduct: auth.product,
      externalTenantId,
      idempotencyKey,
      title,
      description: typeof body.description === "string" ? body.description : null,
      priority: priority as "low" | "normal" | "high" | "urgent",
      assigneeIds,
      groupIds,
      assetIds: strings(assignment.asset_ids),
      assetCategoryId: typeof assignment.asset_category_id === "string" ? assignment.asset_category_id : null,
      propertyId: typeof assignment.property_id === "string" ? assignment.property_id : null,
      procedureIds: strings(assignment.procedure_ids),
      requiresCompletionPhoto: assignment.requires_completion_photo === true,
      expectedResolutionMinutes,
      tags: strings(body.tags),
      context: body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : undefined,
      sourceType: typeof body.source_type === "string" ? body.source_type : null,
      sourceId: typeof body.source_id === "string" ? body.source_id : null,
      sourceUrl: typeof body.source_url === "string" ? body.source_url : null,
    })

    return json({
      ok: true,
      task: {
        id: created.task.id,
        status: created.task.status,
        priority: created.task.priority,
        title: created.task.title,
      },
    }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown"
    if (message === "responsible_required" || message === "invalid_expected_resolution_minutes") {
      return json({ error: message }, 400)
    }
    console.error("[suite-manubot] create task failed", { sourceProduct: auth.product, error: message })
    return json({ error: "manubot_task_create_failed" }, 502)
  }
}
