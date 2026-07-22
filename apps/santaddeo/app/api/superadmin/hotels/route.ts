import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { seedDefaultKpiConfigs } from "@/lib/utils/kpi-visibility"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// GET - List all hotels with filters
export async function GET(request: NextRequest) {
  try {
    const isV0Preview = await isDevAuthAsync()
    
    // Use service role client for data queries (bypasses RLS)
    const supabase = await createServiceRoleClient()
    
    if (!isV0Preview) {
      // Use createClient for auth check (has access to cookies)
      const authClient = await createClient()
      const {
        data: { user },
      } = await authClient.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

      if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }
    
    const searchParams = request.nextUrl.searchParams
    const includeDeleted = searchParams.get("includeDeleted") === "true"
    const organizationId = searchParams.get("organizationId")

    let hotelsQuery = supabase
      .from("hotels")
      .select("*")
      .order("created_at", { ascending: false })

    if (organizationId) {
      hotelsQuery = hotelsQuery.eq("organization_id", organizationId)
    }

    if (!includeDeleted) {
      hotelsQuery = hotelsQuery.is("deleted_at", null)
    }

    const [{ data: hotels, error }, { data: organizations }, { data: pmsIntegrations }] = await Promise.all([
      hotelsQuery,
      supabase.from("organizations").select("*"),
      supabase.from("pms_integrations").select("*"),
    ])

    if (error) {
      console.error("[v0] Error fetching hotels:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build a lookup map for organizations (faster than find for each hotel)
    const orgMap = new Map((organizations || []).map((o) => [o.id, o]))

    const hotelsWithRelations = (hotels || []).map((hotel) => ({
      ...hotel,
      organization: orgMap.get(hotel.organization_id) || null,
      pms_integrations: (pmsIntegrations || []).filter((p) => p.hotel_id === hotel.id),
    }))

    return NextResponse.json({ hotels: hotelsWithRelations })
  } catch (error) {
    console.error("[v0] Error in hotels route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create new hotel
export async function POST(request: NextRequest) {
  try {
    // Use createClient for auth check (has access to cookies)
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Use service role client for data queries (bypasses RLS)
    const supabase = await createServiceRoleClient()

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { pms, ...hotelData } = body

    // Validate PMS is provided
    if (!pms?.pms_name) {
      return NextResponse.json({ error: "Il PMS e obbligatorio per creare una struttura" }, { status: 400 })
    }

    const { data: hotel, error } = await supabase
      .from("hotels")
      .insert({
        organization_id: hotelData.organization_id,
        name: hotelData.name,
        total_rooms: hotelData.total_rooms,
        accommodation_type: hotelData.accommodation_type || "hotel",
        address: hotelData.address,
        city: hotelData.city,
        country: hotelData.country,
        timezone: hotelData.timezone || "Europe/Rome",
        currency: hotelData.currency || "EUR",
        is_active: hotelData.is_active !== false,
        notes: hotelData.notes,
      })
      .select()
      .single()

    if (error) {
      console.error("[v0] Error creating hotel:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Create PMS integration for the new hotel
    const { error: pmsError } = await supabase
      .from("pms_integrations")
      .insert({
        hotel_id: hotel.id,
        pms_name: pms.pms_name,
        api_key: pms.api_key || null,
        api_secret: pms.api_secret || null,
        endpoint_url: pms.endpoint_url || null,
        vat_number: pms.vat_number || null,
        property_id: pms.property_id || null,
        is_active: true,
      })

    if (pmsError) {
      console.error("[v0] Error creating PMS integration:", pmsError)
      // Hotel was created but PMS failed - log but don't fail
    }

    // Seed default KPI configs for the new hotel
    const kpiResult = await seedDefaultKpiConfigs(supabase, hotel.id)
    console.log("[v0] Hotel POST - KPI seed result:", kpiResult)

    return NextResponse.json({ success: true, hotel })
  } catch (error) {
    console.error("[v0] Error in hotels POST route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
