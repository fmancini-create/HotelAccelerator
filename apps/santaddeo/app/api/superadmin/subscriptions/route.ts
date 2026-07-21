import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// GET - List all subscriptions
export async function GET() {
  try {
    const isV0Preview = await isDevAuthAsync()
    const supabase = await createServiceRoleClient()
    
    if (!isV0Preview) {
      const authClient = await createClient()
      const user = await getAuthUser(authClient)
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from("accelerator_subscriptions")
      .select(`
        *,
        hotel:hotels!inner(id, name, total_rooms, organization_id, organization:organizations(id, name))
      `)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error("Error in subscriptions GET:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const isV0Preview = await isDevAuthAsync()
    const supabase = await createServiceRoleClient()
    
    if (!isV0Preview) {
      const authClient = await createClient()
      const user = await getAuthUser(authClient)
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
      if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const body = await request.json()
    const {
      hotel_id,
      plan_type = "fixed_fee",
      algorithm_type = "basic",
      is_active = true,
      payment_status = "active",
      fixed_fee_per_room = 3.0,
      commission_percentage = null,
      commission_basis = "total",
      trial_start_at = null,
      trial_end_at = null,
      next_billing_date = null,
    } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    // Check if hotel already has a subscription
    const { data: existing } = await supabase
      .from("accelerator_subscriptions")
      .select("id")
      .eq("hotel_id", hotel_id)
      .maybeSingle()

    if (existing) {
      console.log("[v0] subscriptions POST - hotel already has subscription")
      return NextResponse.json({ error: "Questo hotel ha gia' un abbonamento" }, { status: 409 })
    }

    console.log("[v0] subscriptions POST - inserting subscription for hotel:", hotel_id)
    const { data, error } = await supabase
      .from("accelerator_subscriptions")
      .insert({
        hotel_id,
        plan_type,
        algorithm_type,
        is_active,
        payment_status,
        fixed_fee_per_room,
        commission_percentage,
        commission_basis,
        trial_start_at,
        trial_end_at: trial_end_at || null,
        next_billing_date: next_billing_date || null,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.log("[v0] subscriptions POST - insert error:", error)
      throw error
    }
    console.log("[v0] subscriptions POST - success, created subscription:", data?.id)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[v0] subscriptions POST - catch error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
