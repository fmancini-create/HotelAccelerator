import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

async function verifySuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const supabaseAdmin = await createServiceRoleClient()
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin" && profile?.role !== "superadmin") return null
  return supabaseAdmin
}

// GET - Fetch all pricing configs
export async function GET() {
  const supabaseAdmin = await verifySuperAdmin()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from("pricing_configs")
    .select("*")
    .order("model_type", { ascending: true })
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ configs: data || [] })
}

// POST - Create a new pricing config
export async function POST(request: NextRequest) {
  const supabaseAdmin = await verifySuperAdmin()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const body = await request.json()
  const { model_type, name, fee_base_value, fee_coefficient_camere, fee_coefficient_appartamenti, fee_coefficient_piazzole, commission_startup_years, commission_yearly_rates, commission_post_startup_rate } = body

  if (!model_type || !name) {
    return NextResponse.json({ error: "model_type e name obbligatori" }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from("pricing_configs")
    .insert({
      model_type,
      name,
      fee_base_value: fee_base_value ?? 5.00,
      fee_coefficient_camere: fee_coefficient_camere ?? 1.00,
      fee_coefficient_appartamenti: fee_coefficient_appartamenti ?? 1.00,
      fee_coefficient_piazzole: fee_coefficient_piazzole ?? 0.50,
      commission_startup_years: commission_startup_years ?? 3,
      commission_yearly_rates: commission_yearly_rates ?? [8, 10, 12],
      commission_post_startup_rate: commission_post_startup_rate ?? 1.00,
      is_default: false,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ config: data })
}

// PUT - Update a pricing config
export async function PUT(request: NextRequest) {
  const supabaseAdmin = await verifySuperAdmin()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: "id obbligatorio" }, { status: 400 })
  }

  // Remove fields that shouldn't be updated directly
  delete updates.created_at
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from("pricing_configs")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ config: data })
}

// DELETE - Delete a pricing config (only non-default)
export async function DELETE(request: NextRequest) {
  const supabaseAdmin = await verifySuperAdmin()
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
  }

  const id = request.nextUrl.searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id obbligatorio" }, { status: 400 })
  }

  // Check if it's default
  const { data: config } = await supabaseAdmin
    .from("pricing_configs")
    .select("is_default")
    .eq("id", id)
    .maybeSingle()

  if (config?.is_default) {
    return NextResponse.json({ error: "Non puoi eliminare un piano di default" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("pricing_configs")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
