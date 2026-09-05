import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"
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

async function context(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return { error: response({ error: "unauthorized" }, 401) } as const
  if (!identity.isTenantAdmin && !identity.isSuperAdmin) return { error: response({ error: "forbidden" }, 403) } as const

  const sb = createServiceClient()
  if (!(await isModuleActive(sb, identity.propertyId, "reviews"))) {
    return { error: response({ error: "reviews_not_active" }, 403) } as const
  }

  const { data: property, error } = await sb
    .from("properties")
    .select("id,name")
    .eq("id", identity.propertyId)
    .maybeSingle()
  if (error) throw error
  if (!property) return { error: response({ error: "property_not_found" }, 404) } as const

  try {
    const workspace = await ensureReviewsWorkspace({
      productKey: "hotelaccelerator",
      externalTenantId: property.id,
      tenantName: property.name,
      origin: "hotelaccelerator",
    })
    return { hotelId: workspace.santaddeoHotelId } as const
  } catch (error) {
    if (error instanceof ReviewsFederationError) {
      return { error: response({ error: error.code }, error.status) } as const
    }
    throw error
  }
}

async function forward(request: NextRequest, method: "GET" | "PATCH") {
  try {
    const ctx = await context(request)
    if ("error" in ctx) return ctx.error

    const upstream = await forwardReviewsConfig({
      hotelId: ctx.hotelId,
      method,
      origin: "hotelaccelerator",
      ...(method === "PATCH" ? { body: await request.text() } : {}),
    })
    return response(upstream.payload, upstream.status)
  } catch (error) {
    if (error instanceof ReviewsFederationError) {
      return response({ error: error.code }, error.status)
    }
    console.error("[reviews] native configuration failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return response({ error: "reviews_config_failed" }, 500)
  }
}

export async function GET(request: NextRequest) {
  return forward(request, "GET")
}

export async function PATCH(request: NextRequest) {
  return forward(request, "PATCH")
}
