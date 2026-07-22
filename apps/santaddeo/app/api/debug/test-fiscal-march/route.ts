import { createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { ScidooClient } from "@/lib/connectors/scidoo/client"

export const dynamic = "force-dynamic"

// Test endpoint to fetch fiscal data for March 2026 only
// Call: /api/debug/test-fiscal-march?hotel_id=8dd3f8c1-284a-43f1-b24f-e6a9d428edca
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id") || "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"
  
  const supabase = await createServiceRoleClient()
  
  // Get PMS integration
  const { data: pmsIntegration, error: pmsError } = await supabase
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", hotelId)
    .single()
  
  if (pmsError || !pmsIntegration) {
    return NextResponse.json({ error: "PMS integration not found", pmsError }, { status: 404 })
  }
  
  const apiKey = pmsIntegration.api_key
  const vatNumber = pmsIntegration.vat_number
  const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
  const endpointUrl = pmsIntegration.endpoint_url || (pmsIntegration.config as any)?.endpoint_url
  
  if (!apiKey || !vatNumber) {
    return NextResponse.json({ 
      error: "Missing API key or VAT number",
      apiKey: apiKey ? "present" : "missing",
      vatNumber: vatNumber ? "present" : "missing"
    }, { status: 400 })
  }
  
  const client = new ScidooClient({ apiKey, propertyId, endpointUrl })
  
  // Test with March 2026 only (small range)
  const startDate = "2026-03-01"
  const endDate = "2026-03-31"
  
  console.log("[v0] TEST: Calling getFiscalProduction for March 2026 only")
  console.log("[v0] TEST: vatNumber =", vatNumber, "startDate =", startDate, "endDate =", endDate)
  
  try {
    const fiscalData = await client.getFiscalProduction(startDate, endDate, vatNumber)
    
    return NextResponse.json({
      success: true,
      dateRange: { startDate, endDate },
      vatNumber,
      results: {
        tax_documents_count: (fiscalData.tax_documents || []).length,
        fees_count: (fiscalData.fees || []).length,
        deposits_count: (fiscalData.deposits || []).length,
        suspended_invoices_count: (fiscalData.suspended_invoices || []).length,
      },
      sample_invoice: (fiscalData.tax_documents || [])[0],
      sample_fee: (fiscalData.fees || [])[0],
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      dateRange: { startDate, endDate },
      vatNumber,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
