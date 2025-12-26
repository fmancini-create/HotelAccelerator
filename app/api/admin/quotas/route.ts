import { NextResponse } from "next/server"
import { getPropertyFromSession } from "@/lib/auth-property"
import { getQuotaStatus } from "@/lib/tenant-quotas"
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, rateLimitHeaders } from "@/lib/rate-limiter"

export async function GET() {
  try {
    const { propertyId } = await getPropertyFromSession()

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
    return NextResponse.json({ error: "Failed to fetch quota status" }, { status: 500 })
  }
}
