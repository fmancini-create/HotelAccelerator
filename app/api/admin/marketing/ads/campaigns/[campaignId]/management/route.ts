import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import type { AdvertisingManagementMode } from "@/lib/advertising/types"

const ALLOWED_MODES = new Set<AdvertisingManagementMode>(["observe", "assist", "autopilot"])

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    await requireAreaApi("marketing", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const { campaignId } = await context.params
    const body = (await request.json()) as { management_mode?: AdvertisingManagementMode }
    const mode = body.management_mode
    if (!mode || !ALLOWED_MODES.has(mode)) {
      return NextResponse.json({ error: "management_mode must be observe, assist or autopilot" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: campaign, error: findError } = await supabase
      .from("advertising_campaigns")
      .select("id, origin, management_mode")
      .eq("id", campaignId)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (findError) throw findError
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    const { data, error } = await supabase
      .from("advertising_campaigns")
      .update({ management_mode: mode, updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("property_id", propertyId)
      .select("id, management_mode, updated_at")
      .single()

    if (error) throw error

    return NextResponse.json({
      ...data,
      notice:
        mode === "observe"
          ? "HotelAccelerator osservera la campagna senza modificarla."
          : mode === "assist"
            ? "HotelAccelerator puo proporre modifiche; ogni applicazione resta esplicita."
            : "Autopilot abilitato. I limiti economici saranno applicati dal motore di guardrail prima delle modifiche provider.",
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error changing advertising campaign management mode:", error)
    return NextResponse.json({ error: "Failed to change campaign management mode" }, { status: 500 })
  }
}
