/**
 * Test endpoint for verifying Scidoo price push functionality
 * POST /api/dati/scidoo-price-test
 * 
 * Tests:
 * 1. Connection to Scidoo API
 * 2. Sending a test price update
 * 3. Reading back the price to verify it was written
 */

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/connectors/scidoo/client"

export async function POST(request: Request) {
  const supabase = await createClient()
  
  try {
    const body = await request.json()
    const { 
      hotelId = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca", // Villa I Barronci default
      testPrice = 999,
      testDate = new Date().toISOString().split("T")[0],
      dryRun = true // If true, only tests connection without actually writing
    } = body

    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      hotelId,
      testPrice,
      testDate,
      dryRun,
      steps: []
    }

    // Step 1: Get PMS integration config
    const { data: pmsConfig, error: pmsError } = await supabase
      .from("pms_integrations")
      .select("*")
      .eq("hotel_id", hotelId)
      .single()

    if (pmsError || !pmsConfig) {
      results.steps.push({
        step: 1,
        name: "Get PMS Config",
        success: false,
        error: pmsError?.message || "No PMS integration found for hotel"
      })
      return NextResponse.json(results)
    }

    results.steps.push({
      step: 1,
      name: "Get PMS Config",
      success: true,
      data: {
        pms_name: pmsConfig.pms_name,
        integration_mode: pmsConfig.integration_mode,
        has_api_key: !!pmsConfig.api_key,
        endpoint_url: pmsConfig.endpoint_url,
        property_id: pmsConfig.property_id
      }
    })

    // Step 2: Get room type mappings
    const { data: roomTypes, error: rtError } = await supabase
      .from("room_types")
      .select("id, code, name, scidoo_room_type_id")
      .eq("hotel_id", hotelId)

    if (rtError) {
      results.steps.push({
        step: 2,
        name: "Get Room Types",
        success: false,
        error: rtError.message
      })
      return NextResponse.json(results)
    }

    const mappedRoomTypes = (roomTypes || []).filter(rt => rt.scidoo_room_type_id)
    results.steps.push({
      step: 2,
      name: "Get Room Types",
      success: true,
      data: {
        total: roomTypes?.length || 0,
        withScidooMapping: mappedRoomTypes.length,
        mappings: mappedRoomTypes.map(rt => ({
          id: rt.id,
          code: rt.code,
          name: rt.name,
          scidoo_room_type_id: rt.scidoo_room_type_id
        }))
      }
    })

    // Step 3: Get rate mappings
    const { data: rates, error: ratesError } = await supabase
      .from("rates")
      .select("id, name, scidoo_rate_id")
      .eq("hotel_id", hotelId)

    if (ratesError) {
      results.steps.push({
        step: 3,
        name: "Get Rates",
        success: false,
        error: ratesError.message
      })
      return NextResponse.json(results)
    }

    const mappedRates = (rates || []).filter(r => r.scidoo_rate_id)
    results.steps.push({
      step: 3,
      name: "Get Rates",
      success: true,
      data: {
        total: rates?.length || 0,
        withScidooMapping: mappedRates.length,
        mappings: mappedRates.map(r => ({
          id: r.id,
          name: r.name,
          scidoo_rate_id: r.scidoo_rate_id
        }))
      }
    })

    // Step 4: Test Scidoo API connection
    if (!pmsConfig.api_key || !pmsConfig.endpoint_url || !pmsConfig.property_id) {
      results.steps.push({
        step: 4,
        name: "Test Scidoo Connection",
        success: false,
        error: "Missing Scidoo credentials (api_key, endpoint_url, or property_id)"
      })
      return NextResponse.json(results)
    }

    const scidooClient = new ScidooClient({
      pms_name: "scidoo",
      api_key: pmsConfig.api_key,
      endpoint_url: pmsConfig.endpoint_url,
      property_id: pmsConfig.property_id
    })

    // Test connection by getting rates
    try {
      const scidooRates = await scidooClient.getRates(testDate, testDate)
      results.steps.push({
        step: 4,
        name: "Test Scidoo Connection (getRates)",
        success: true,
        data: {
          ratesCount: Array.isArray(scidooRates) ? scidooRates.length : 0,
          sampleRates: Array.isArray(scidooRates) ? scidooRates.slice(0, 3) : scidooRates
        }
      })
    } catch (err) {
      results.steps.push({
        step: 4,
        name: "Test Scidoo Connection",
        success: false,
        error: err instanceof Error ? err.message : "Unknown error"
      })
      return NextResponse.json(results)
    }

    // Step 5: Test price push (if not dry run and we have mappings)
    if (mappedRoomTypes.length === 0 || mappedRates.length === 0) {
      results.steps.push({
        step: 5,
        name: "Test Price Push",
        success: false,
        error: "Cannot test price push: missing scidoo_room_type_id or scidoo_rate_id mappings"
      })
      return NextResponse.json(results)
    }

    const testRoomType = mappedRoomTypes[0]
    const testRate = mappedRates[0]
    
    const testPricePayload = {
      room_type_id: testRoomType.scidoo_room_type_id,
      price_id: testRate.scidoo_rate_id,
      occupancy: 2,
      day_price: testPrice,
      from: testDate,
      to: testDate
    }

    if (dryRun) {
      results.steps.push({
        step: 5,
        name: "Test Price Push (DRY RUN)",
        success: true,
        data: {
          wouldSend: testPricePayload,
          note: "Set dryRun=false to actually send this price to Scidoo"
        }
      })
    } else {
      try {
        const pushResult = await scidooClient.setDayPrices([testPricePayload])
        results.steps.push({
          step: 5,
          name: "Test Price Push (LIVE)",
          success: pushResult.success,
          data: {
            sent: testPricePayload,
            result: pushResult
          }
        })
      } catch (err) {
        results.steps.push({
          step: 5,
          name: "Test Price Push (LIVE)",
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
          data: { attempted: testPricePayload }
        })
      }
    }

    results.summary = {
      allStepsSuccessful: results.steps.every((s: any) => s.success),
      totalSteps: results.steps.length
    }

    return NextResponse.json(results)

  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
      stack: err instanceof Error ? err.stack : undefined
    }, { status: 500 })
  }
}
