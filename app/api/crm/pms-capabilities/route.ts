import { type NextRequest, NextResponse } from "next/server"

import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { getSantaddeoPmsCapabilities, SantaddeoPmsGatewayError } from "@/lib/pms/santaddeo-gateway"
import { createServiceClient } from "@/lib/supabase/server"

async function resolveSantaddeoHotelId(propertyId: string) {
  const sb = createServiceClient()
  const { data: account, error: accountError } = await sb
    .from("customer_accounts")
    .select("id")
    .eq("property_id", propertyId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!account?.id) return null

  const { data: link, error: linkError } = await sb
    .from("suite_tenant_links")
    .select("external_tenant_id")
    .eq("customer_account_id", account.id)
    .eq("product_key", "santaddeo")
    .maybeSingle()
  if (linkError) throw linkError
  return (link?.external_tenant_id as string | undefined) ?? null
}

export async function GET(request: NextRequest) {
  const decision = await requireAreaApi("crm", request)
  if (isAreaDenied(decision)) return areaDeniedResponse(decision)

  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const hotelId = await resolveSantaddeoHotelId(propertyId)
    if (!hotelId) {
      return NextResponse.json({ status: "not_linked", provider: null, data: [], actions: [], endpoints: [] })
    }
    return NextResponse.json(await getSantaddeoPmsCapabilities(hotelId))
  } catch (error) {
    if (error instanceof SantaddeoPmsGatewayError) {
      return NextResponse.json({ error: error.code }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "pms_capabilities_failed"
    return NextResponse.json({ error: message }, { status: message === "Non autenticato" ? 401 : 500 })
  }
}
