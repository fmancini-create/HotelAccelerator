import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import {
  ensureReviewsWorkspace,
  forwardReviewBookingAssignment,
  ReviewsFederationError,
} from "@/lib/reviews/federation"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return response({ error: "unauthorized" }, 401)
  if (!identity.isTenantAdmin && !identity.isSuperAdmin) return response({ error: "forbidden" }, 403)

  const sb = createServiceClient()
  if (!(await isModuleActive(sb, identity.propertyId, "reviews"))) {
    return response({ error: "reviews_not_active" }, 403)
  }

  const { data: property, error } = await sb
    .from("properties")
    .select("id,name")
    .eq("id", identity.propertyId)
    .maybeSingle()
  if (error) return response({ error: "property_read_failed" }, 500)
  if (!property) return response({ error: "property_not_found" }, 404)

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: "hotelaccelerator",
      externalTenantId: property.id,
      tenantName: property.name,
      origin: "hotelaccelerator",
    })
    const upstream = await forwardReviewBookingAssignment({
      hotelId: workspace.santaddeoHotelId,
      origin: "hotelaccelerator",
      body: await request.text(),
    })
    return response(upstream.payload, upstream.status)
  } catch (error) {
    if (error instanceof ReviewsFederationError) return response({ error: error.code }, error.status)
    console.error("[reviews] booking assignment failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "review_booking_assignment_failed" }, 500)
  }
}
