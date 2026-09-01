import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"
import { getOpenAICostSummary, OpenAICostConfigurationError, OpenAICostRequestError } from "@/lib/integrations/openai/admin-costs"
import { SuperAdminService } from "@/lib/platform-services"

async function requireSuperAdmin(request: NextRequest) {
  const actorEmail = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(actorEmail)
}

function requestedDays(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("days")
  if (!raw) return 90
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) return null
  return parsed
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const days = requestedDays(request)
    if (days === null) {
      return NextResponse.json({ error: "days deve essere un intero tra 1 e 180" }, { status: 400 })
    }

    const summary = await getOpenAICostSummary(days)
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    if (error instanceof OpenAICostConfigurationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "openai_costs_not_configured",
        },
        { status: 503 },
      )
    }

    if (error instanceof OpenAICostRequestError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "openai_costs_provider_error",
        },
        { status: 502 },
      )
    }

    return handleServiceError(error)
  }
}
