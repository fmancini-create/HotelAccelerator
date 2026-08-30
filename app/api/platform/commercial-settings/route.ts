import { type NextRequest, NextResponse } from "next/server"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { getSuiteCommercialSettings } from "@/lib/suite-commercial"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const settings = await getSuiteCommercialSettings(supabase)
    return NextResponse.json({ settings, canManage: identity.isSuperAdmin })
  } catch (error) {
    const status = accessErrorStatus(error)
    if (!isAccessError(error)) console.error("[v0] Commercial settings GET error:", error)
    return NextResponse.json({ error: status === 500 ? "Failed to fetch commercial settings" : (error as Error).message }, { status })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireTenantAdmin(request)
    if (!identity.isSuperAdmin) {
      return NextResponse.json({ error: "Solo il superadmin puo modificare gli sconti commerciali" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const discount = Number(body.crossSellDiscountPercent)
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return NextResponse.json({ error: "Lo sconto deve essere compreso tra 0 e 100" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase
      .from("suite_commercial_settings")
      .update({
        cross_sell_enabled: body.crossSellEnabled !== false,
        cross_sell_discount_percent: discount,
        allow_promotion_stacking: body.allowPromotionStacking === true,
        updated_at: new Date().toISOString(),
        updated_by_user_id: /^[0-9a-f-]{36}$/i.test(identity.userId) ? identity.userId : null,
        updated_by_email: identity.email,
      })
      .eq("id", "default")

    if (error) throw error
    return NextResponse.json({ success: true, settings: await getSuiteCommercialSettings(supabase) })
  } catch (error) {
    const status = accessErrorStatus(error)
    if (!isAccessError(error)) console.error("[v0] Commercial settings PATCH error:", error)
    return NextResponse.json({ error: status === 500 ? "Failed to update commercial settings" : (error as Error).message }, { status })
  }
}
