import { type NextRequest, NextResponse } from "next/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { syncAdvertisingAccount } from "@/lib/advertising/provider-client"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })
    const { accountId } = await context.params
    const result = await syncAdvertisingAccount(propertyId, accountId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Sincronizzazione advertising fallita"
    console.error("Error syncing advertising account:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
