import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId") || searchParams.get("hotel_id")
    const activeOnly = searchParams.get("active") !== "false"
    
    // DEV MODE bypass
    const isDev = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development"
    
    if (!isDev) {
      const supabase = await createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      }
    } else {
      console.log("[v0] GET subscription - DEV MODE bypass")
    }

    // Use service role to bypass RLS for reading subscriptions
    const adminClient = await createServiceRoleClient()

    let query = adminClient.from("accelerator_subscriptions").select("*")

    if (hotelId) {
      query = query.eq("hotel_id", hotelId)
    }

    if (activeOnly) {
      query = query.eq("is_active", true)
    }

    const { data: subscriptions, error } = await query.order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching subscriptions:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch hotels for subscriptions
    const hotelIds = [...new Set(subscriptions?.map((s) => s.hotel_id).filter(Boolean))]
    let hotels: any[] = []

    if (hotelIds.length > 0) {
      const { data: hotelsData } = await adminClient.from("hotels").select("*").in("id", hotelIds)
      hotels = hotelsData || []
    }

    // Attach hotels to subscriptions
    const subscriptionsWithHotels =
      subscriptions?.map((sub) => ({
        ...sub,
        hotel: hotels.find((h) => h.id === sub.hotel_id) || null,
      })) || []

    return NextResponse.json({ subscriptions: subscriptionsWithHotels })
  } catch (error) {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

// PUT: Update subscription fields (e.g. algorithm_type)
export async function PUT(request: Request) {
  try {
    // DEV MODE bypass
    const isDev = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development"
    
    if (!isDev) {
      // Auth check with user client (only in production)
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      console.log("[v0] PUT subscription - user:", user?.id, "authError:", authError?.message)
      if (authError || !user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
      }
    } else {
      console.log("[v0] PUT subscription - DEV MODE bypass")
    }

    const body = await request.json()
    const { hotel_id, algorithm_type } = body
    console.log("[v0] PUT subscription - hotel_id:", hotel_id, "algorithm_type:", algorithm_type)

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (algorithm_type && ["basic", "advanced"].includes(algorithm_type)) {
      updateData.algorithm_type = algorithm_type
    }

    if (Object.keys(updateData).length === 0) {
      console.log("[v0] PUT subscription - no valid fields to update")
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    // Use service role client to bypass RLS (only SELECT policy exists on this table).
    // FIX 21/05/2026: prima usava createClient() (SSR/anon) → UPDATE bloccato
    // silenziosamente da RLS, .select() vuoto, route 404, UI tornava a "basic".
    const adminClient = await createServiceRoleClient()
    console.log("[v0] PUT subscription - updating with:", updateData)
    const { data, error } = await adminClient
      .from("accelerator_subscriptions")
      .update(updateData)
      .eq("hotel_id", hotel_id)
      .eq("is_active", true)
      .select()

    if (error) {
      console.error("[v0] Error updating subscription:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] PUT subscription - updated data:", data)
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No active subscription found for this hotel" }, { status: 404 })
    }

    return NextResponse.json({ success: true, subscription: data[0] })
  } catch (error) {
    console.error("[v0] Server error in PUT subscription:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
