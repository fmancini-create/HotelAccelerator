import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getSuiteCommercialSettings } from "@/lib/suite-commercial"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  "Access-Control-Allow-Origin": "*",
}

/**
 * Fonte pubblica e non sensibile della policy commerciale 4BID.
 * La percentuale viene gestita esclusivamente dal Superadmin nel Core
 * HotelAccelerator; gli altri prodotti la leggono senza duplicarla.
 */
export async function GET() {
  try {
    const settings = await getSuiteCommercialSettings(createServiceClient())
    return NextResponse.json(
      {
        enabled: settings.crossSellEnabled,
        discountPercent: settings.crossSellDiscountPercent,
        allowPromotionStacking: settings.allowPromotionStacking,
        label: "Vantaggio cliente 4BID",
        managedBy: "HotelAccelerator Core",
      },
      { headers: HEADERS },
    )
  } catch (error) {
    console.error("[suite-commercial-policy] read failed", error)
    return NextResponse.json(
      { error: "commercial_policy_unavailable" },
      { status: 503, headers: { ...HEADERS, "Cache-Control": "no-store" } },
    )
  }
}
