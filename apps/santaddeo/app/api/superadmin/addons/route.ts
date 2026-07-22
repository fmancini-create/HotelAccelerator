import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"

// GET - List all addon subscriptions
export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")

    let query = supabase
      .from("addon_subscriptions")
      .select(`
        *,
        hotels(id, name),
        profiles:user_id(id, email, full_name)
      `)
      .order("created_at", { ascending: false })

    if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ addons: data || [] })
  } catch (error) {
    console.error("Error fetching addons:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create addon subscription (manual by superadmin)
export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      hotel_id,
      user_id,
      addon_type = "premium_expert",
      status = "active",
      price_cents = 49900,
      billing_interval = "year",
      current_period_end,
    } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    // Calculate period end if not provided (1 year from now)
    const periodEnd = current_period_end || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from("addon_subscriptions")
      .upsert({
        hotel_id,
        user_id,
        addon_type,
        status,
        price_cents,
        billing_interval,
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "hotel_id,addon_type",
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, addon: data })
  } catch (error) {
    console.error("Error creating addon:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - Update addon subscription
export async function PATCH(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("addon_subscriptions")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, addon: data })
  } catch (error) {
    console.error("Error updating addon:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Cancel addon subscription
export async function DELETE(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const { error } = await supabase
      .from("addon_subscriptions")
      .update({ 
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting addon:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
