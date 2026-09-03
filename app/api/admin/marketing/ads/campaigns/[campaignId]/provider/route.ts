import { type NextRequest, NextResponse } from "next/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import {
  updateAdvertisingCampaignBudget,
  updateAdvertisingCampaignStatus,
} from "@/lib/advertising/provider-client"

type ProviderMutationBody = {
  active?: boolean
  budget_amount?: number
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const { campaignId } = await context.params
    const body = (await request.json()) as ProviderMutationBody
    const wantsStatus = typeof body.active === "boolean"
    const wantsBudget = typeof body.budget_amount === "number"
    if (!wantsStatus && !wantsBudget) {
      return NextResponse.json({ error: "Nessuna modifica provider richiesta" }, { status: 400 })
    }
    if (wantsStatus) await updateAdvertisingCampaignStatus(propertyId, campaignId, body.active as boolean)
    if (wantsBudget) await updateAdvertisingCampaignBudget(propertyId, campaignId, body.budget_amount as number)

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Modifica advertising fallita"
    console.error("Error mutating advertising campaign:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
