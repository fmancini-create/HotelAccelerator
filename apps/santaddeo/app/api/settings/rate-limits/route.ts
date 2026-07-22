import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { cookies } from "next/headers"

async function getAuthenticatedHotelId() {
  const isV0Preview = await isDevAuthAsync()
  const adminClient = await createClient()

  let userId: string

  if (isV0Preview) {
    userId = "5de43b7b-e661-4e4e-8177-7943df06470c"
  } else {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: "Non autenticato", status: 401 }
    }
    userId = user.id
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  // Resolve hotel_id following the same logic as /api/ui/selected-hotel
  const cookieStore = await cookies()
  let hotelId: string | null = null

  // Priority 1: SuperAdmin with impersonation cookie
  if (isSuperAdmin) {
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value
    if (impersonatedHotelId) {
      hotelId = impersonatedHotelId
    } else {
      // Priority 2: SuperAdmin without impersonation -> first hotel in system
      const { data: hotels } = await adminClient
        .from("hotels")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
      hotelId = hotels?.[0]?.id || null
    }
  }
  // Priority 3: Regular user -> hotel from their organization
  else if (profile?.organization_id) {
    const { data: hotels } = await adminClient
      .from("hotels")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: true })
      .limit(1)
    hotelId = hotels?.[0]?.id || null
  }

  if (!hotelId) {
    return { error: "Nessun hotel associato", status: 400 }
  }

  return { hotelId, userId, role: profile?.role, supabase: adminClient }
}

// GET - Fetch rate limits for all room types of the hotel
export async function GET(_req: NextRequest) {
  try {
    const auth = await getAuthenticatedHotelId()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { hotelId, role, supabase } = auth

    // Check subscription
    const { data: subscription } = await supabase
      .from("accelerator_subscriptions")
      .select("is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    const isAccelerator = role === "super_admin" || !!subscription?.is_active

    // Get all room types for this hotel.
    // IMPORTANT: use the same ordering as /settings/pms (display_order, with
    // NULLs last and name as a tie-breaker) so the Limiti Tariffari page lists
    // the room types in the exact same order the user configured in the PMS
    // section. Before this fix the list was alphabetical by name.
    const { data: roomTypes, error: rtError } = await supabase
      .from("room_types")
      .select("id, name, code, total_rooms, display_order")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true })

    if (rtError) {
      return NextResponse.json({ error: rtError.message }, { status: 500 })
    }

    // Get existing rate limits
    const { data: limits, error: limError } = await supabase
      .from("room_type_rate_limits")
      .select("*")
      .eq("hotel_id", hotelId)

    if (limError) {
      return NextResponse.json({ error: limError.message }, { status: 500 })
    }

    // Merge: for each room type, attach its limits (or defaults)
    const limitsMap = new Map(
      (limits || []).map((l: any) => [l.room_type_id, l])
    )

    const result = (roomTypes || []).map((rt: any) => {
      const lim = limitsMap.get(rt.id) as any
      return {
        room_type_id: rt.id,
        room_type_name: rt.name,
        room_type_code: rt.code,
        total_rooms: rt.total_rooms,
        bottom_rate: lim?.bottom_rate ?? 0,
        rack_rate: lim?.rack_rate ?? 999,
        updated_at: lim?.updated_at ?? null,
      }
    })

    return NextResponse.json({ rateLimits: result, isAccelerator })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST - Save rate limits for all room types
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedHotelId()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { hotelId, role, supabase } = auth

    // Check subscription
    const { data: subscription } = await supabase
      .from("accelerator_subscriptions")
      .select("is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    const isAccelerator = role === "super_admin" || !!subscription?.is_active
    if (!isAccelerator) {
      return NextResponse.json(
        { error: "Accelerator non attivo. Attiva Accelerator per modificare i limiti tariffari." },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { rateLimits } = body as {
      rateLimits: Array<{
        room_type_id: string
        bottom_rate: number
        rack_rate: number
      }>
    }

    if (!rateLimits || !Array.isArray(rateLimits)) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 })
    }

    // Validate: bottom_rate must be >= 0, rack_rate must be >= bottom_rate
    for (const rl of rateLimits) {
      if (rl.bottom_rate < 0) {
        return NextResponse.json(
          { error: "La Bottom Rate non puo essere negativa." },
          { status: 400 }
        )
      }
      if (rl.rack_rate < rl.bottom_rate) {
        return NextResponse.json(
          { error: `La Rack Rate deve essere >= Bottom Rate per ogni tipologia.` },
          { status: 400 }
        )
      }
    }

    // Upsert each rate limit
    for (const rl of rateLimits) {
      const { error } = await supabase
        .from("room_type_rate_limits")
        .upsert(
          {
            hotel_id: hotelId,
            room_type_id: rl.room_type_id,
            bottom_rate: rl.bottom_rate,
            rack_rate: rl.rack_rate,
          },
          { onConflict: "hotel_id,room_type_id" }
        )

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
