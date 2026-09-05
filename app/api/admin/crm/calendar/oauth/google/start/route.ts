import { NextResponse, type NextRequest } from "next/server"
import { requireCalendarIdentity } from "@/lib/calendar/access"
import { buildGoogleCalendarOAuthUrl } from "@/lib/calendar/google-user-calendar"
import { createCalendarOAuthState } from "@/lib/calendar/oauth-state"
import { accessErrorStatus } from "@/lib/auth/admin-access"

export async function POST(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    const body = await request.json().catch(() => ({}))
    const intent = body?.intent === "shared" ? "shared" : "personal"
    if (intent === "shared" && !identity.isSuperAdmin && !identity.isTenantAdmin) {
      return NextResponse.json({ error: "Solo un amministratore può collegare un calendario condiviso" }, { status: 403 })
    }
    const state = createCalendarOAuthState({
      userId: identity.userId,
      propertyId: identity.propertyId,
      intent,
    })
    return NextResponse.json({ authUrl: buildGoogleCalendarOAuthUrl(state) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile avviare il collegamento" },
      { status: accessErrorStatus(error) || 500 },
    )
  }
}
