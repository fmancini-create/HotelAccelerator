import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { normalizeSegmentConditions, validateSegmentConditions } from "@/lib/crm/segment-engine"
import { computePreviewCount } from "@/lib/crm/segment-service"

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const body = await request.json()
    const conditions = normalizeSegmentConditions(body.conditions)
    const validationErrors = validateSegmentConditions(conditions)
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors[0], details: validationErrors }, { status: 400 })
    }

    const supabase = createServiceClient()
    const count = await computePreviewCount(supabase, propertyId, conditions)
    return NextResponse.json({ count })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error previewing segment:", error)
    return NextResponse.json({ error: "Failed to preview segment" }, { status: 500 })
  }
}
