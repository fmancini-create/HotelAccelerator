import { type NextRequest, NextResponse } from "next/server"

import {
  createSuiteManubotTask,
  getSuiteManubotTaskFormData,
} from "@/lib/manubot/suite-task-hub"
import { forwardReviewTicketIntelligence } from "@/lib/reviews/federation"
import { resolveNativeReviewsContext } from "@/lib/reviews/route-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const PRIORITIES = new Set(["low", "normal", "high", "urgent"])

type TicketIntelligence = {
  detected?: {
    room_number?: string | null
    room_type?: string | null
    area_name?: string | null
    issue_type?: string | null
    symptoms?: string[]
    operational_details?: string[]
    safety_risks?: string[]
    guest_impact?: string | null
    confidence?: number
  }
  ticket?: {
    title?: string
    description?: string
    priority?: "low" | "normal" | "high" | "urgent"
    asset_ids?: string[]
    asset_category_id?: string | null
    property_id?: string | null
    tags?: string[]
  }
  matched?: {
    assets?: Array<{ id: string; name: string; location?: string | null }>
    asset_category?: { id: string; name: string } | null
    property?: { id: string; name: string } | null
  }
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

function numberOrNull(value: unknown) {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function legacyPriority(review: Record<string, unknown>) {
  const rating = numberOrNull(review.rating)
  if (rating != null && rating <= 1.5) return "urgent" as const
  if ((rating != null && rating <= 2.5) || review.sentiment === "negative") return "high" as const
  return "normal" as const
}

function legacyTitle(review: Record<string, unknown>) {
  const platform = typeof review.platform === "string" ? review.platform : "HotelAccelerator"
  const rating = numberOrNull(review.rating)
  const score = rating != null ? ` ${rating.toFixed(1)}/5` : ""
  const subject = typeof review.title === "string" ? review.title.trim() : ""
  return (subject ? `Recensione ${platform}${score}: ${subject}` : `Recensione ${platform}${score} da gestire`).slice(0, 240)
}

function legacyDescription(review: Record<string, unknown>) {
  const rating = numberOrNull(review.rating)
  return [
    typeof review.author_name === "string" && review.author_name ? `Ospite: ${review.author_name}` : null,
    rating != null ? `Valutazione: ${rating.toFixed(1)}/5` : null,
    typeof review.review_date === "string" && review.review_date ? `Data recensione: ${review.review_date}` : null,
    typeof review.title === "string" && review.title ? `Titolo: ${review.title}` : null,
    typeof review.text === "string" && review.text ? `Recensione:\n${review.text}` : null,
  ].filter(Boolean).join("\n")
}

export async function GET(request: NextRequest) {
  const context = await resolveNativeReviewsContext(request)
  if (context.error) return context.error
  try {
    const result = await getSuiteManubotTaskFormData("hotelaccelerator", context.property!.id)
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
  const context = await resolveNativeReviewsContext(request)
  if (context.error) return context.error

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return response({ error: "invalid_request" }, 400)

  const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : ""
  const requestedTitle = typeof body.title === "string" ? body.title.trim() : ""
  const requestedDescription = typeof body.description === "string" ? body.description.trim() : ""
  const responsible = typeof body.responsible === "string" ? body.responsible.trim() : ""
  const expectedResolutionMinutes = Number(body.expectedResolutionMinutes ?? 60)
  const requestedPriority = typeof body.priority === "string" && PRIORITIES.has(body.priority)
    ? (body.priority as "low" | "normal" | "high" | "urgent")
    : null

  if (!reviewId) return response({ error: "review_required" }, 400)
  if (requestedTitle.length > 240) return response({ error: "invalid_title" }, 400)
  if (!responsible || (!responsible.startsWith("operator:") && !responsible.startsWith("group:"))) {
    return response({ error: "responsible_required" }, 400)
  }
  if (!Number.isInteger(expectedResolutionMinutes) || expectedResolutionMinutes < 5 || expectedResolutionMinutes > 1440) {
    return response({ error: "invalid_expected_resolution_minutes" }, 400)
  }

  const assigneeIds = responsible.startsWith("operator:") ? [responsible.slice("operator:".length)] : []
  const groupIds = responsible.startsWith("group:") ? [responsible.slice("group:".length)] : []
  const reviewContext = body.review && typeof body.review === "object" ? (body.review as Record<string, unknown>) : {}

  let intelligence: TicketIntelligence | null = null
  try {
    const upstream = await forwardReviewTicketIntelligence({
      hotelId: context.workspace!.santaddeoHotelId,
      origin: "hotelaccelerator",
      body: JSON.stringify({ reviewId }),
    })
    if (upstream.status >= 200 && upstream.status < 300) {
      const payload = upstream.payload as { intelligence?: TicketIntelligence }
      intelligence = payload.intelligence || null
    } else {
      console.warn("[reviews] ticket intelligence upstream unavailable", { reviewId, status: upstream.status })
    }
  } catch (error) {
    console.warn("[reviews] ticket intelligence failed; continuing with safe fallback", {
      reviewId,
      error: error instanceof Error ? error.message : "unknown",
    })
  }

  const oldTitle = legacyTitle(reviewContext)
  const oldDescription = legacyDescription(reviewContext)
  const oldPriority = legacyPriority(reviewContext)
  const title = (
    requestedTitle && requestedTitle !== oldTitle
      ? requestedTitle
      : intelligence?.ticket?.title || requestedTitle || oldTitle
  ).slice(0, 240)
  if (!title) return response({ error: "invalid_title" }, 400)

  const manualNotes = requestedDescription && requestedDescription !== oldDescription
    ? requestedDescription
    : ""
  const description = intelligence?.ticket?.description
    ? `${intelligence.ticket.description}${manualNotes ? `\n\nNOTE OPERATORE\n${manualNotes}` : ""}`
    : requestedDescription || oldDescription
  const priority = requestedPriority && requestedPriority !== oldPriority
    ? requestedPriority
    : intelligence?.ticket?.priority || requestedPriority || oldPriority

  const basePlatform = typeof reviewContext.platform === "string" ? reviewContext.platform : "hotelaccelerator"
  const tags = Array.from(new Set(["recensione", basePlatform, ...(intelligence?.ticket?.tags || [])]))

  try {
    const created = await createSuiteManubotTask({
      sourceProduct: "hotelaccelerator",
      externalTenantId: context.property!.id,
      idempotencyKey: `reviews:ha:${context.property!.id}:${reviewId}`.slice(0, 200),
      title,
      description,
      priority,
      assigneeIds,
      groupIds,
      assetIds: intelligence?.ticket?.asset_ids || [],
      assetCategoryId: intelligence?.ticket?.asset_category_id || null,
      propertyId: intelligence?.ticket?.property_id || null,
      expectedResolutionMinutes,
      tags,
      context: {
        review_id: reviewId,
        ...reviewContext,
        room_number: intelligence?.detected?.room_number || null,
        room_type: intelligence?.detected?.room_type || null,
        area_name: intelligence?.detected?.area_name || null,
        issue_type: intelligence?.detected?.issue_type || null,
        symptoms: intelligence?.detected?.symptoms || [],
        operational_details: intelligence?.detected?.operational_details || [],
        safety_risks: intelligence?.detected?.safety_risks || [],
        guest_impact: intelligence?.detected?.guest_impact || null,
        matched_assets: intelligence?.matched?.assets || [],
        matched_asset_category: intelligence?.matched?.asset_category || null,
        matched_property: intelligence?.matched?.property || null,
        ticket_intelligence_confidence: intelligence?.detected?.confidence ?? null,
      },
      sourceType: "review",
      sourceId: reviewId,
      sourceUrl: `${request.nextUrl.origin}/admin/reviews?review=${encodeURIComponent(reviewId)}`,
    })
    return response({ ok: true, task: created.task, intelligence }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : "manubot_task_create_failed"
    if (message === "addon_inactive") return response({ error: "addon_inactive" }, 403)
    if (message === "local_module_not_provisioned" || message === "manubot_tenant_not_linked" || message === "addon_configuration_required") {
      return response({ error: "addon_configuration_required" }, 409)
    }
    if (message === "responsible_required" || message === "invalid_expected_resolution_minutes") {
      return response({ error: message }, 400)
    }
    console.error("[reviews] ManuBot task failed", { error: message })
    return response({ error: "manubot_task_create_failed" }, 502)
  }
}
