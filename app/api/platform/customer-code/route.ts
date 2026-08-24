import { type NextRequest, NextResponse } from "next/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { getOrCreateCustomerProductCode } from "@/lib/customer-codes/registry"
import { customerCodeDigits } from "@/lib/telephony/customer-code"

export const dynamic = "force-dynamic"

/**
 * Identificatore da mostrare nella piattaforma. Il codice non e' segreto e non
 * sblocca azioni: l'endpoint non restituisce altri dati della struttura.
 */
export async function GET(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!identity.propertyId) return NextResponse.json({ error: "property_required" }, { status: 400 })

  try {
    const code = await getOrCreateCustomerProductCode(identity.propertyId, "hotelaccelerator")
    if (!code) return NextResponse.json({ error: "not_found" }, { status: 404 })

    return NextResponse.json({
      customer_code: code.code,
      telephone_digits: customerCodeDigits(code.code, code.productKey),
      product: { key: "hotelaccelerator", prefix: "HA", label: "Hotel Accelerator" },
    })
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}
