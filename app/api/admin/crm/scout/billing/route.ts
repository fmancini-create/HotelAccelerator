import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { getScoutTenantBillingState } from "@/lib/scout/billing"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const billing = await getScoutTenantBillingState(createServiceClient(), propertyId)
    return NextResponse.json({ billing })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Scout tenant billing state error:", error)
    return NextResponse.json({ error: "Impossibile leggere il saldo Scout." }, { status: 500 })
  }
}
