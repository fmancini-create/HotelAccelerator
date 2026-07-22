import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

// Helper to parse checklist_status JSONB
function parseChecklist(checklist: any) {
  const defaultChecklist = {
    room_types: { mapped: 0, total: 0, complete: false },
    rate_plans: { mapped: 0, total: 0, complete: false },
    channels: { mapped: 0, total: 0, complete: false },
    completeness_percentage: 0,
  }

  if (!checklist) return defaultChecklist

  return {
    room_types: checklist.room_types || defaultChecklist.room_types,
    rate_plans: checklist.rate_plans || defaultChecklist.rate_plans,
    channels: checklist.channels || defaultChecklist.channels,
    completeness_percentage: checklist.completeness_percentage || 0,
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createServiceRoleClient()
  const { searchParams } = new URL(request.url)
  const providerId = searchParams.get("provider_id")

  try {
    let query = supabase.from("hotel_bindings").select(`
        *,
        hotels!inner(id, name),
        pms_providers!inner(id, name, code)
      `)

    if (providerId) {
      query = query.eq("pms_provider_id", providerId)
    }

    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching hotel bindings:", error)
      return NextResponse.json({ bindings: [] })
    }

    // Fetch per-hotel PMS integration info (api_key, vat_number, endpoint_url)
    const hotelIds = (data || []).map((b: any) => b.hotel_id)
    const [integrationsResult, hotelsWithOrgResult] = await Promise.all([
      hotelIds.length > 0
        ? supabase
            .from("pms_integrations")
            .select("id, hotel_id, api_key, vat_number, endpoint_url, property_id, is_active, integration_mode")
            .in("hotel_id", hotelIds)
        : Promise.resolve({ data: [] }),
      // Also fetch organization vat_number for fallback
      hotelIds.length > 0
        ? supabase
            .from("hotels")
            .select("id, organization_id, organizations(vat_number)")
            .in("id", hotelIds)
        : Promise.resolve({ data: [] }),
    ])

    const integrations = integrationsResult.data || []
    const hotelsWithOrg = hotelsWithOrgResult.data || []

    const integrationsByHotel = new Map(
      integrations.map((i: any) => [i.hotel_id, i])
    )
    const orgVatByHotel = new Map(
      hotelsWithOrg.map((h: any) => [h.id, (h.organizations as any)?.vat_number || null])
    )

    const bindings = (data || []).map((b: any) => {
      const checklist = parseChecklist(b.checklist_status)
      const integration = integrationsByHotel.get(b.hotel_id)
      // Fallback chain: pms_integrations.vat_number -> organizations.vat_number
      const resolvedVat = integration?.vat_number || orgVatByHotel.get(b.hotel_id) || null
      return {
        id: b.id,
        hotel_id: b.hotel_id,
        hotel_name: b.hotels?.name || "Unknown",
        pms_provider_id: b.pms_provider_id,
        pms_name: b.pms_providers?.name || "Unknown",
        provider_code: b.pms_providers?.code || null,
        // Sub-PMS valorizzato solo quando il provider è Brig (whitelist enforced via DB CHECK).
        // Esempio: hotel su Brig che dietro ha Mews → brig_sub_pms = "mews".
        brig_sub_pms: b.brig_sub_pms || null,
        status: b.status,
        room_types_mapped: checklist.room_types.complete,
        rate_plans_mapped: checklist.rate_plans.complete,
        channels_mapped: checklist.channels.complete,
        checklist_status: checklist,
        created_at: b.created_at,
        activated_at: b.activated_at,
        notes: b.notes,
        // Per-hotel PMS integration info (with org fallback for vat_number)
        has_api_key: !!integration?.api_key,
        api_key_masked: integration?.api_key
          ? `${integration.api_key.substring(0, 4)}...${integration.api_key.slice(-4)}`
          : null,
        vat_number: resolvedVat,
        endpoint_url: integration?.endpoint_url || null,
        property_id: integration?.property_id || null,
        pms_integration_id: integration?.id || null,
        // Integration mode: "api" (con API Key) o "gsheets" (solo Google Sheets)
        integration_mode: integration?.integration_mode || null,
      }
    })

    return NextResponse.json({ bindings })
  } catch (error) {
    console.error("Error in hotel-bindings API:", error)
    return NextResponse.json({ bindings: [] })
  }
}

// PUT: Create a new binding
export async function PUT(request: NextRequest) {
  const supabase = await createServiceRoleClient()

  try {
    const body = await request.json()
    const { hotel_id, pms_provider_id } = body

    if (!hotel_id || !pms_provider_id) {
      return NextResponse.json({ error: "hotel_id e pms_provider_id sono obbligatori" }, { status: 400 })
    }

    // Check if binding already exists
    const { data: existing } = await supabase
      .from("hotel_bindings")
      .select("id")
      .eq("hotel_id", hotel_id)
      .eq("pms_provider_id", pms_provider_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: "Binding già esistente per questo hotel e provider" }, { status: 409 })
    }

    // Get pms_integration_id if exists
    const { data: integration } = await supabase
      .from("pms_integrations")
      .select("id")
      .eq("hotel_id", hotel_id)
      .maybeSingle()

    // Create new binding
    const { data, error } = await supabase
      .from("hotel_bindings")
      .insert({
        hotel_id,
        pms_provider_id,
        pms_integration_id: integration?.id || null,
        status: "INCOMPLETE",
        checklist_status: {
          room_types: { mapped: 0, total: 0, complete: false },
          rate_plans: { mapped: 0, total: 0, complete: false },
          channels: { mapped: 0, total: 0, complete: false },
          completeness_percentage: 0,
        },
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating binding:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ binding: data, created: true })
  } catch (error: any) {
    console.error("Error in hotel-bindings PUT:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Update existing binding
export async function POST(request: NextRequest) {
  const supabase = await createServiceRoleClient()

  try {
    const body = await request.json()
    const { binding_id, room_types_mapped, rate_plans_mapped, channels_mapped, status, brig_sub_pms } = body

    // First fetch current binding to get existing checklist
    const { data: current, error: fetchError } = await supabase
      .from("hotel_bindings")
      .select("checklist_status")
      .eq("id", binding_id)
      .single()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 400 })
    }

    // Build updated checklist_status
    const checklist = parseChecklist(current?.checklist_status)

    if (room_types_mapped !== undefined) {
      checklist.room_types.complete = room_types_mapped
    }
    if (rate_plans_mapped !== undefined) {
      checklist.rate_plans.complete = rate_plans_mapped
    }
    if (channels_mapped !== undefined) {
      checklist.channels.complete = channels_mapped
    }

    // Calculate completeness
    const completed = [checklist.room_types.complete, checklist.rate_plans.complete].filter(Boolean).length
    checklist.completeness_percentage = Math.round((completed / 2) * 100)

    // Determine status
    let newStatus = status
    if (!newStatus) {
      if (checklist.room_types.complete && checklist.rate_plans.complete) {
        newStatus = "COMPLETE"
      } else {
        newStatus = "INCOMPLETE"
      }
    }

    const updateData: Record<string, any> = {
      checklist_status: checklist,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }
    // Aggiorna brig_sub_pms se fornito esplicitamente. Stringa vuota = NULL (clear).
    // La whitelist dei valori ammessi è applicata da CHECK constraint a livello DB.
    if (brig_sub_pms !== undefined) {
      updateData.brig_sub_pms = brig_sub_pms === "" ? null : brig_sub_pms
    }

    const { data, error } = await supabase
      .from("hotel_bindings")
      .update(updateData)
      .eq("id", binding_id)
      .select()
      .single()

    if (error) {
      console.error("Error updating binding:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ binding: data })
  } catch (error: any) {
    console.error("Error in hotel-bindings POST:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
