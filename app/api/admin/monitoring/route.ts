import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getTenantMetrics, checkTenantHealth, getAllTenantMetrics } from "@/lib/monitoring"
import { getTenantStats } from "@/lib/query-optimizer"
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, rateLimitHeaders } from "@/lib/rate-limiter"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Super admin check — in dev always false, fine
    const isSuperAdmin = false

    // Rate limiting
    const rateLimitResult = checkRateLimit(`${propertyId}:monitoring`, RATE_LIMITS.read)
    if (!rateLimitResult.success) {
      return rateLimitExceeded(rateLimitResult)
    }

    // Get metrics and stats
    const [metrics, health, stats] = await Promise.all([
      Promise.resolve(getTenantMetrics(propertyId)),
      Promise.resolve(checkTenantHealth(propertyId)),
      getTenantStats(propertyId),
    ])

    const response: Record<string, unknown> = {
      propertyId,
      metrics,
      health,
      stats,
      timestamp: new Date().toISOString(),
    }

    // Super admins can see all tenant metrics
    if (isSuperAdmin) {
      response.allTenants = getAllTenantMetrics()
    }

    return NextResponse.json(response, {
      headers: rateLimitHeaders(rateLimitResult),
    })
  } catch (error) {
    console.error("Error fetching monitoring data:", error)
    return NextResponse.json({ error: "Failed to fetch monitoring data" }, { status: 500 })
  }
}
