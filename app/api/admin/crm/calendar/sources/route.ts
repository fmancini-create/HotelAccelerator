import { NextResponse, type NextRequest } from "next/server"
import { accessErrorStatus } from "@/lib/auth/admin-access"
import { listVisibleCalendarSources, requireCalendarIdentity } from "@/lib/calendar/access"

export async function GET(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    const sources = await listVisibleCalendarSources(identity)
    return NextResponse.json({
      sources: sources.map((source) => ({
        id: source.id,
        label: source.label,
        color: source.color,
        kind: source.source_kind,
        permission: source.permission,
        provider: source.provider,
        isPersonal: source.source_kind === "personal" && source.owner_user_id === identity.userId,
      })),
      canManageShared: identity.isSuperAdmin || identity.isTenantAdmin,
      isSuperAdmin: identity.isSuperAdmin,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore calendario" },
      { status: accessErrorStatus(error) },
    )
  }
}
