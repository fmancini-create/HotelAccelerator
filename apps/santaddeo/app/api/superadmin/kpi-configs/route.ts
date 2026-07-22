import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET - Fetch all KPI configs for a hotel
export async function GET(request: NextRequest) {
  const hotelId = request.nextUrl.searchParams.get("hotel_id")
  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from("dashboard_kpi_configs")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("display_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ configs: data || [] })
}

// PUT - Toggle a KPI on/off
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const supabaseAdmin = await createServiceRoleClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "super_admin" && profile?.role !== "property_admin") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const body = await request.json()
  const hotelId = body.hotel_id

  // If property_admin, verify they own this hotel
  if (profile?.role === "property_admin" && profile?.organization_id) {
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("organization_id")
      .eq("id", hotelId)
      .maybeSingle()

    if (!hotel || hotel.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Non hai accesso a questa struttura" }, { status: 403 })
    }
  }
  const kpiKey = body.kpi_key
  const isEnabled = body.is_enabled

  if (!hotelId || !kpiKey || typeof isEnabled !== "boolean") {
    return NextResponse.json({ error: "hotel_id, kpi_key, is_enabled required" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("dashboard_kpi_configs")
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq("hotel_id", hotelId)
    .eq("kpi_key", kpiKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
