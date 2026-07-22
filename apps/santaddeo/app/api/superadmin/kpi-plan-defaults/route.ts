import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// GET - Fetch KPI plan defaults (optionally filtered by plan_type)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const supabaseAdmin = await createServiceRoleClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const planType = request.nextUrl.searchParams.get("plan_type")

  let query = supabaseAdmin
    .from("kpi_plan_defaults")
    .select("*")
    .order("kpi_key", { ascending: true })

  if (planType) {
    query = query.eq("plan_type", planType)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ defaults: data || [] })
}

// PUT - Update a KPI plan default toggle
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const supabaseAdmin = await createServiceRoleClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const body = await request.json()

  // Support batch updates: { updates: [{ plan_type, kpi_key, is_enabled }] }
  if (body.updates && Array.isArray(body.updates)) {
    const upserts = body.updates.map((u: { plan_type: string; kpi_key: string; is_enabled: boolean }) => ({
      plan_type: u.plan_type,
      kpi_key: u.kpi_key,
      is_enabled: u.is_enabled,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabaseAdmin
      .from("kpi_plan_defaults")
      .upsert(upserts, { onConflict: "plan_type,kpi_key" })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: upserts.length })
  }

  // Single update: { planType, kpiKey, isEnabled }
  const { planType, kpiKey, isEnabled } = body

  if (!planType || !kpiKey || typeof isEnabled !== "boolean") {
    return NextResponse.json({ error: "planType, kpiKey, isEnabled obbligatori" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("kpi_plan_defaults")
    .upsert({
      plan_type: planType,
      kpi_key: kpiKey,
      is_enabled: isEnabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "plan_type,kpi_key" })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// POST - Apply plan defaults to a specific hotel (or all hotels of a plan)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const supabaseAdmin = await createServiceRoleClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const action = request.nextUrl.searchParams.get("action")
  const queryHotelId = request.nextUrl.searchParams.get("hotelId")
  
  let planType: string | null = null
  let hotelId: string | null = queryHotelId

  if (action === "apply-to-hotel" && queryHotelId) {
    // Get the hotel's plan type from subscription
    const { data: sub } = await supabaseAdmin
      .from("accelerator_subscriptions")
      .select("plan_type")
      .eq("hotel_id", queryHotelId)
      .eq("is_active", true)
      .maybeSingle()

    planType = sub?.plan_type || "free"
    hotelId = queryHotelId
  } else {
    const body = await request.json()
    planType = body.planType
    hotelId = body.hotelId
  }

  if (!planType) {
    return NextResponse.json({ error: "planType obbligatorio" }, { status: 400 })
  }

  // Get plan defaults
  const { data: defaults } = await supabaseAdmin
    .from("kpi_plan_defaults")
    .select("kpi_key, is_enabled")
    .eq("plan_type", planType)

  if (!defaults || defaults.length === 0) {
    return NextResponse.json({ error: "Nessun default trovato per questo piano" }, { status: 404 })
  }

  // Determine which hotels to update
  let hotelIds: string[] = []
  if (hotelId) {
    hotelIds = [hotelId]
  } else {
    // Get all hotels with this plan type
    const { data: subs } = await supabaseAdmin
      .from("accelerator_subscriptions")
      .select("hotel_id")
      .eq("plan_type", planType)
      .eq("is_active", true)

    hotelIds = (subs || []).map(s => s.hotel_id)
  }

  if (hotelIds.length === 0) {
    return NextResponse.json({ error: "Nessun hotel trovato per questo piano" }, { status: 404 })
  }

  let updatedCount = 0
  for (const hId of hotelIds) {
    // Get existing KPI config for this hotel to preserve labels/descriptions
    const { data: existingConfigs } = await supabaseAdmin
      .from("dashboard_kpi_configs")
      .select("kpi_key, label, description, display_order")
      .eq("hotel_id", hId)

    const existingMap: Record<string, { label: string; description: string; display_order: number }> = {}
    if (existingConfigs) {
      for (const ec of existingConfigs) {
        existingMap[ec.kpi_key] = { label: ec.label, description: ec.description, display_order: ec.display_order }
      }
    }

    for (const def of defaults) {
      // Upsert to handle both existing and new KPIs
      const { error } = await supabaseAdmin
        .from("dashboard_kpi_configs")
        .upsert({
          hotel_id: hId,
          kpi_key: def.kpi_key,
          is_enabled: def.is_enabled,
          label: existingMap[def.kpi_key]?.label || def.kpi_key,
          description: existingMap[def.kpi_key]?.description || "",
          display_order: existingMap[def.kpi_key]?.display_order || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "hotel_id,kpi_key" })

      if (!error) updatedCount++
    }
  }

  return NextResponse.json({ success: true, updatedCount, hotelsAffected: hotelIds.length })
}
