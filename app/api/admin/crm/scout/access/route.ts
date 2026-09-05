import { type NextRequest, NextResponse } from "next/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { resolveScoutAccess } from "@/lib/crm/scout-access"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const access = await resolveScoutAccess(request, propertyId)

    return NextResponse.json({
      enabled: access.enabled,
      canAssign: access.canAssign,
      isAdmin: access.isAdmin,
      isGroupLead: access.isGroupLead,
      isSuperAdmin: access.isSuperAdmin,
      userId: access.userId,
      label: access.label,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const status = isAccessError(error) ? accessErrorStatus(error) : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile verificare l'accesso a Scout." },
      { status },
    )
  }
}
