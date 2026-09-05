import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import {
  createSuiteManubotTask,
  getSuiteManubotTaskFormData,
} from "@/lib/manubot/suite-task-hub"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

async function authorize(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return { error: response({ error: "unauthorized" }, 401) } as const
  if (!identity.isTenantAdmin && !identity.isSuperAdmin) return { error: response({ error: "forbidden" }, 403) } as const
  const sb = createServiceClient()
  if (!(await isModuleActive(sb, identity.propertyId, "reviews"))) {
    return { error: response({ error: "reviews_not_active" }, 403) } as const
  }
  return { propertyId: identity.propertyId } as const
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request)
  if ("error" in auth) return auth.error
  try {
    const result = await getSuiteManubotTaskFormData("hotelaccelerator", auth.propertyId)
    if (!result) return response({ error: "suite_customer_not_linked" }, 404)
    return response({
      status: result.context.status,
      active: result.context.active,
      reason: result.context.reason,
      activation_url: result.context.activationUrl,
      task_data: result.taskData,
    })
  } catch (error) {
    console.error("[reviews] ManuBot context failed", { error: error instanceof Error ? error.message : "unknown" })
    return response({ error: "manubot_context_unavailable" }, 502)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request)
  if ("error" in auth) return auth.error

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return response({ error: "invalid_request" }, 400)

  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : ""
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description = typeof body.description === "string" ? body.description.trim() : ""
  const responsible = typeof body.responsible === "string" ? body.responsible.trim() : ""
  const expectedResolutionMinutes = Number(body.expectedResolutionMinutes ?? 60)
  const priority = typeof body.priority === "string" ? body.priority.trim() : ""

  if (!reviewId) return response({ error: "review_required" }, 400)
  if (!title || title.length > 240) return response({ error: "invalid_title" }, 400)
  if (!priority) return response({ error: "priority_required" }, 400)
  if (!responsible || (!responsible.startsWith("operator:") && !responsible.startsWith("group:"))) {
    return response({ error: "responsible_required" }, 400)
  }
  if (!Number.isInteger(expectedResolutionMinutes) || expectedResolutionMinutes < 5 || expectedResolutionMinutes > 1440) {
    return response({ error: "invalid_expected_resolution_minutes" }, 400)
  }

  const assigneeIds = responsible.startsWith("operator:") ? [responsible.slice("operator:".length)] : []
  const groupIds = responsible.startsWith("group:") ? [responsible.slice("group:".length)] : []
  const reviewContext = body.review && typeof body.review === "object" ? (body.review as Record<string, unknown>) : {}

  try {
    const form = await getSuiteManubotTaskFormData("hotelaccelerator", auth.propertyId)
    if (!form) return response({ error: "suite_customer_not_linked" }, 404)
    if (!form.context.active) {
      return response(
        { error: form.context.status === "inactive" ? "addon_inactive" : "addon_configuration_required" },
        form.context.status === "inactive" ? 403 : 409,
      )
    }
    if (form.taskData?.priorities?.some((item) => item.name === priority) !== true) {
      return response({ error: "invalid_priority", available_priorities: form.taskData?.priorities || [] }, 400)
    }

    const created = await createSuiteManubotTask({
      sourceProduct: "hotelaccelerator",
      externalTenantId: auth.propertyId,
      idempotencyKey: `reviews:ha:${auth.propertyId}:${reviewId}`.slice(0, 200),
      title,
      description,
      priority,
      assigneeIds,
      groupIds,
      expectedResolutionMinutes,
      tags: ["recensione", typeof reviewContext.platform === "string" ? reviewContext.platform : "hotelaccelerator"],
      context: { review_id: reviewId, ...reviewContext },
      sourceType: "review",
      sourceId: reviewId,
      sourceUrl: `${request.nextUrl.origin}/admin/reviews?review=${encodeURIComponent(reviewId)}`,
    })
    return response({ ok: true, task: created.task }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : "manubot_task_create_failed"
    if (message === "addon_inactive") return response({ error: "addon_inactive" }, 403)
    if (message === "local_module_not_provisioned" || message === "manubot_tenant_not_linked" || message === "addon_configuration_required") {
      return response({ error: "addon_configuration_required" }, 409)
    }
    if (message === "responsible_required" || message === "invalid_expected_resolution_minutes" || message === "priority_required") {
      return response({ error: message }, 400)
    }
    console.error("[reviews] ManuBot task failed", { error: message })
    return response({ error: "manubot_task_create_failed" }, 502)
  }
}
