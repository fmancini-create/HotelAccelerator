// API endpoint to trigger Scidoo sync manually
// POST /api/sync/scidoo

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooSync } from "@/lib/connectors/scidoo/sync"
import type { ScidooConfig } from "@/lib/connectors/types"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hotel_id, date_from, date_to, sync_type } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    // Default to last 30 days if not specified
    const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const dateTo = date_to || new Date().toISOString().split("T")[0]

    const supabase = await createServiceRoleClient()

    // Get PMS integration config for this hotel
    const { data: integration, error: integrationError } = await supabase
      .from("pms_integrations")
      .select("*")
      .eq("hotel_id", hotel_id)
      .eq("pms_name", "scidoo")
      .eq("is_active", true)
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({ error: "No active Scidoo integration found for this hotel" }, { status: 404 })
    }

    // Create Scidoo sync instance
    const scidooConfig: ScidooConfig = {
      pms_name: "scidoo",
      api_key: integration.api_key,
      endpoint_url: integration.endpoint_url,
      property_id: integration.property_id || (integration.config?.property_id as string),
    }

    const sync = new ScidooSync(scidooConfig, hotel_id, integration.id)

    // Perform sync based on type
    let result

    if (sync_type === "bookings") {
      result = await sync.syncBookings(dateFrom, dateTo)
    } else if (sync_type === "availability") {
      result = await sync.syncAvailability(dateFrom, dateTo)
    } else if (sync_type === "rates") {
      result = await sync.syncRates(dateFrom, dateTo)
    } else if (sync_type === "fiscal_production") {
      result = await sync.syncFiscalProduction(dateFrom, dateTo)
    } else {
      // Sync all by default
      result = await sync.syncAll(dateFrom, dateTo)
    }

    return NextResponse.json({
      success: true,
      hotel_id,
      date_from: dateFrom,
      date_to: dateTo,
      sync_type: sync_type || "all",
      result,
    })
  } catch (error) {
    console.error("[v0] Sync API error:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
