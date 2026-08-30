import { type NextRequest, NextResponse } from "next/server"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { getModulesWithState } from "@/lib/modules"
import { toTenantModuleViews } from "@/lib/modules/tenant-view"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import {
  applyPercentageDiscount,
  getCrossSellOffer,
  getSuiteCommercialContext,
  type SuiteProduct,
} from "@/lib/suite-commercial"

export const dynamic = "force-dynamic"

const SUITE_MODULE_KEYS = new Set<SuiteProduct>(["santaddeo", "hotelprofitai", "manubot"])

export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const supabase = createServiceClient()
    const [modulesWithState, commercialContext] = await Promise.all([
      getModulesWithState(supabase, propertyId),
      getSuiteCommercialContext(supabase, propertyId),
    ])

    const modules = toTenantModuleViews(modulesWithState).map((module) => {
      if (!SUITE_MODULE_KEYS.has(module.key as SuiteProduct)) {
        return {
          ...module,
          crossSellEligible: false,
          crossSellDiscountPercent: 0,
          discountedMonthlyPriceCents: module.monthlyPriceCents,
        }
      }

      const offer = getCrossSellOffer(commercialContext, module.key as SuiteProduct)
      return {
        ...module,
        crossSellEligible: offer.eligible,
        crossSellDiscountPercent: offer.discountPercent,
        discountedMonthlyPriceCents:
          module.monthlyPriceCents === null || !offer.eligible
            ? module.monthlyPriceCents
            : applyPercentageDiscount(module.monthlyPriceCents, offer.discountPercent),
      }
    })

    return NextResponse.json({ propertyId, modules })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (!isAccessError(error)) console.error("[v0] Modules GET error:", error)
    const status = accessErrorStatus(error)
    const message = error instanceof Error && status !== 500 ? error.message : "Failed to fetch modules"
    return NextResponse.json({ error: message }, { status })
  }
}
