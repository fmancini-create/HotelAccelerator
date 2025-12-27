import { type NextRequest, NextResponse } from "next/server"
import { getPropertyFromSession } from "@/lib/auth-property"
import { getQuotaStatus } from "@/lib/tenant-quotas"
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, rateLimitHeaders } from "@/lib/rate-limiter"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getPropertyFromSession(request)

    if (!propertyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limiting
    const rateLimitResult = checkRateLimit(`${propertyId}:quotas`, RATE_LIMITS.read)
    if (!rateLimitResult.success) {
      return rateLimitExceeded(rateLimitResult)
    }

    const quotaStatus = await getQuotaStatus(propertyId)

    return NextResponse.json(quotaStatus, {
      headers: rateLimitHeaders(rateLimitResult),
    })
  } catch (error) {
    console.error("Error fetching quotas:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch quota status"
    const status = message === "Non autenticato" ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
