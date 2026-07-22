/**
 * API route for connector health data
 * Used by the superadmin connectors-health page
 */

import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { 
  checkAllConnectorsHealth, 
  getLatestHealthByHotel,
  checkConnectorHealth 
} from "@/lib/services/connector-health-service"

export const dynamic = "force-dynamic"

// GET: Fetch latest health status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Use service role client for data fetching
    const serviceClient = await createServiceRoleClient()
    const healthData = await getLatestHealthByHotel(serviceClient)

    return NextResponse.json({
      success: true,
      data: healthData,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[ConnectorsHealth API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// POST: Trigger manual health check
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user is superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || (profile.role !== "superadmin" && profile.role !== "super_admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { hotelId } = body

    // Use service role client for operations
    const serviceClient = await createServiceRoleClient()

    if (hotelId) {
      // Check single hotel
      const result = await checkConnectorHealth(serviceClient, hotelId)
      return NextResponse.json({
        success: !!result,
        data: result,
        timestamp: new Date().toISOString(),
      })
    } else {
      // Check all hotels
      const result = await checkAllConnectorsHealth(serviceClient)
      return NextResponse.json({
        success: result.success,
        checked: result.checked,
        alerts: result.alerts,
        data: result.results,
        timestamp: new Date().toISOString(),
        error: result.error,
      })
    }
  } catch (error) {
    console.error("[ConnectorsHealth API] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
