import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getTenantMetrics, checkTenantHealth, getAllTenantMetrics } from "@/lib/monitoring"
import { getTenantStats } from "@/lib/query-optimizer"
import { getQuotaStatus } from "@/lib/tenant-quotas"
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, rateLimitHeaders } from "@/lib/rate-limiter"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)

    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const isSuperAdmin = false

    const rateLimitResult = checkRateLimit(`${propertyId}:monitoring`, RATE_LIMITS.read)
    if (!rateLimitResult.success) {
      return rateLimitExceeded(rateLimitResult)
    }

    // Pull everything the dashboard expects in one go.
    // quotaStatus is what /admin/monitoring renders directly; metrics+health
    // are kept available for power users / super-admin views.
    const [metrics, health, stats, quotaStatus] = await Promise.all([
      Promise.resolve(getTenantMetrics(propertyId)),
      Promise.resolve(checkTenantHealth(propertyId)),
      getTenantStats(propertyId),
      getQuotaStatus(propertyId),
    ])

    const response: Record<string, unknown> = {
      propertyId,
      quotaStatus,
      stats,
      metrics,
      health,
      timestamp: new Date().toISOString(),
    }

    if (isSuperAdmin) {
      response.allTenants = getAllTenantMetrics()
    }

    return NextResponse.json(response, {
      headers: rateLimitHeaders(rateLimitResult),
    })
  } catch (error) {
    console.error("[v0] Error fetching monitoring data:", error)
    return NextResponse.json({ error: "Failed to fetch monitoring data" }, { status: 500 })
  }
}
