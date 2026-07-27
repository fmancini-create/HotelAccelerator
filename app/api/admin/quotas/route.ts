import { type NextRequest, NextResponse } from "next/server"
import { getPropertyFromSession } from "@/lib/auth-property"
import { getQuotaStatus } from "@/lib/tenant-quotas"
import { checkRateLimit, RATE_LIMITS, rateLimitExceeded, rateLimitHeaders } from "@/lib/rate-limiter"
import { handleServiceError } from "@/lib/errors"

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
    // handleServiceError mappa gia' "Non autenticato" -> 401 e
    // "nessun tenant selezionato"/"non associato a nessuna struttura" -> 403,
    // e non logga come errore le condizioni di auth attese.
    // Prima qui c'era un console.error con stack su OGNI sessione scaduta.
    return handleServiceError(error)
  }
}
