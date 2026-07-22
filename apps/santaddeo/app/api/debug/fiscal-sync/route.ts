import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/connectors/scidoo/client"

export const dynamic = "force-dynamic"

/**
 * DEBUG endpoint: manually run fiscal sync for a specific hotel
 * GET /api/debug/fiscal-sync?hotel_id=7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9
 * Optional: &date_from=2026-02-03&date_to=2026-03-06
 */
export async function GET(request: NextRequest) {
  // Use nextUrl.searchParams (App Router pattern)
  const url = request.nextUrl
  const hotelId = url.searchParams.get("hotel_id")
  const dateFromParam = url.searchParams.get("date_from")
  const dateToParam = url.searchParams.get("date_to")
  
  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
  }

  const logs: string[] = []
  const log = (msg: string, data?: any) => {
    const entry = data !== undefined ? `${msg} ${JSON.stringify(data)}` : msg
    logs.push(entry)
    console.log("[v0] FISCAL DEBUG:", entry)
  }

  try {
    const supabase = await createServiceRoleClient()
    
    // 1. Get hotel and PMS integration (vat_number is in pms_integrations, not hotels)
    log("Fetching hotel and PMS integration for hotel_id:", hotelId)
    
    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("id, name")
      .eq("id", hotelId)
      .single()
    
    if (hotelError || !hotel) {
      log("Hotel not found:", hotelError?.message)
      return NextResponse.json({ error: "Hotel not found", logs }, { status: 404 })
    }
    log("Hotel found:", { name: hotel.name })

    const { data: pmsIntegration, error: pmsError } = await supabase
      .from("pms_integrations")
      .select("id, property_id, api_key, endpoint_url, config, vat_number")
      .eq("hotel_id", hotelId)
      .eq("pms_name", "scidoo")
      .eq("is_active", true)
      .single()
    
    if (pmsError || !pmsIntegration) {
      log("PMS integration not found:", pmsError?.message)
      return NextResponse.json({ error: "PMS integration not found", logs }, { status: 404 })
    }
    log("PMS integration found:", { 
      id: pmsIntegration.id, 
      property_id: pmsIntegration.property_id,
      has_api_key: !!pmsIntegration.api_key,
      endpoint_url: pmsIntegration.endpoint_url,
      vat_number: pmsIntegration.vat_number
    })

    // 2. Build date range (use params or default to last 30 days)
    const endDate = dateToParam || new Date().toISOString().split("T")[0]
    const startDate = dateFromParam || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const vatNumber = pmsIntegration.vat_number

    log("API request parameters:", { startDate, endDate, vatNumber })

    // 3. Create Scidoo client and fetch fiscal data
    const propertyId = pmsIntegration.property_id || (pmsIntegration.config as any)?.property_id
    const client = new ScidooClient({
      apiKey: pmsIntegration.api_key,
      propertyId,
      endpointUrl: pmsIntegration.endpoint_url
    })

    log("Calling Scidoo getFiscalProduction...")
    
    let fiscalData: any
    try {
      fiscalData = await client.getFiscalProduction(startDate, endDate, vatNumber)
    } catch (apiError: any) {
      log("API ERROR:", apiError?.message || apiError)
      return NextResponse.json({ 
        error: "Scidoo API call failed", 
        apiError: apiError?.message,
        logs 
      }, { status: 500 })
    }

    // 4. Log API response
    log("API response received")
    log("API response keys:", Object.keys(fiscalData || {}))
    log("tax_documents count:", (fiscalData?.tax_documents || []).length)
    log("fees count:", (fiscalData?.fees || []).length)
    log("deposits count:", (fiscalData?.deposits || []).length)
    log("suspended_invoices count:", (fiscalData?.suspended_invoices || []).length)

    // 5. Parse documents
    const allRawDocs = [
      ...(fiscalData?.tax_documents || []).map((d: any) => ({ ...d, type: "invoice" })),
      ...(fiscalData?.fees || []).map((d: any) => ({ ...d, type: "fee" })),
      ...(fiscalData?.suspended_invoices || []).map((d: any) => ({ ...d, type: "suspended_invoice" })),
      ...(fiscalData?.deposits || []).map((d: any) => ({ ...d, type: "deposit" })),
    ]
    log("Total documents parsed:", allRawDocs.length)

    // 6. Group by date
    const rawByDate = new Map<string, any[]>()
    for (const doc of allRawDocs) {
      const regDate = doc.registration_date || doc.document_date
      if (!regDate) {
        log("Document without date skipped:", { type: doc.type, id: doc.id || doc.document_number })
        continue
      }
      if (!rawByDate.has(regDate)) rawByDate.set(regDate, [])
      rawByDate.get(regDate)!.push(doc)
    }
    log("Grouped into dates:", rawByDate.size)

    // 7. Insert into connectors.scidoo_raw_fiscal_production
    log("Starting insert to connectors.scidoo_raw_fiscal_production...")
    
    let insertedCount = 0
    const insertErrors: string[] = []

    for (const [date, docs] of rawByDate) {
      const totalRevenue = docs
        .filter((d: any) => d.type === "invoice" || d.type === "fee")
        .reduce((sum: number, d: any) => sum + (parseFloat(d.total || d.taxable) || 0), 0)

      const { error } = await supabase.schema("connectors").from("scidoo_raw_fiscal_production").upsert(
        {
          hotel_id: hotelId,
          pms_integration_id: pmsIntegration?.id,
          date,
          total_revenue: totalRevenue,
          raw_data: {
            documents: docs,
            total_revenue: totalRevenue,
            invoices_count: docs.filter((d: any) => d.type === "invoice").length,
            fees_count: docs.filter((d: any) => d.type === "fee").length,
            deposits_count: docs.filter((d: any) => d.type === "deposit").length,
            suspended_count: docs.filter((d: any) => d.type === "suspended_invoice").length,
            sync_period: { from: startDate, to: endDate },
          },
          synced_at: new Date().toISOString(),
        },
        { onConflict: "hotel_id,date" }
      )
      
      if (error) {
        log(`INSERT ERROR for date ${date}:`, error.message)
        insertErrors.push(`${date}: ${error.message}`)
      } else {
        insertedCount++
      }
    }

    log("Insert complete:", { insertedCount, errorCount: insertErrors.length })
    if (insertErrors.length > 0) {
      log("Insert errors (first 5):", insertErrors.slice(0, 5))
    }

    // 8. Verify data in table
    const { data: verifyData, error: verifyError } = await supabase
      .schema("connectors")
      .from("scidoo_raw_fiscal_production")
      .select("date, total_revenue")
      .eq("hotel_id", hotelId)
      .order("date", { ascending: false })
      .limit(5)
    
    log("Verification query:", verifyError ? verifyError.message : `${verifyData?.length || 0} rows found`)

    return NextResponse.json({
      success: true,
      summary: {
        hotel: hotel.name,
        dateRange: { startDate, endDate },
        apiResponse: {
          tax_documents: (fiscalData?.tax_documents || []).length,
          fees: (fiscalData?.fees || []).length,
          deposits: (fiscalData?.deposits || []).length,
          suspended_invoices: (fiscalData?.suspended_invoices || []).length,
        },
        totalDocuments: allRawDocs.length,
        datesGrouped: rawByDate.size,
        inserted: insertedCount,
        errors: insertErrors.length,
      },
      insertErrors: insertErrors.slice(0, 10),
      verification: verifyData,
      logs
    })

  } catch (error: any) {
    log("UNEXPECTED ERROR:", error?.message || error)
    return NextResponse.json({ 
      error: "Unexpected error", 
      message: error?.message,
      logs 
    }, { status: 500 })
  }
}
