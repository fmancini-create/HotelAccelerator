import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

// GET - Get single hotel details
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params


    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    // In dev mode (v0 preview), allow access without auth
    const isDevMode = process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"

    if (!user && !isDevMode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const serviceSupabase = await createServiceRoleClient()

    const [{ data: hotel, error }, { data: organizations }, { data: pmsIntegrations }, { data: roomTypes }] =
      await Promise.all([
        serviceSupabase.from("hotels").select("*").eq("id", id).maybeSingle(),
        serviceSupabase.from("organizations").select("*"),
        serviceSupabase.from("pms_integrations").select("*").eq("hotel_id", id),
        serviceSupabase.from("room_types").select("*").eq("hotel_id", id),
      ])

    if (error) {
      console.error("[v0] Error fetching hotel:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }

    // Attach relations manually
    const hotelWithRelations = {
      ...hotel,
      organization: organizations?.find((o) => o.id === hotel.organization_id) || null,
      pms_integrations: pmsIntegrations || [],
      room_types: roomTypes || [],
    }

    return NextResponse.json({ hotel: hotelWithRelations })
  } catch (error) {
    console.error("[v0] Error in hotel GET route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PATCH - Update hotel
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Verify superadmin access
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // In dev mode (v0 preview), allow access without auth
    const isDevMode = process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"

    if (!user && !isDevMode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const body = await request.json()
    const { pms, ...hotelData } = body

    console.log("[v0] PATCH hotel - id:", id, "hotelData keys:", Object.keys(hotelData))

    const serviceSupabase = await createServiceRoleClient()

    // Remove any fields that don't exist in the hotels table
    const allowedFields = [
      "name", "total_rooms", "accommodation_type", "address", "city", "country", "star_rating", 
      "organization_id", "timezone", "currency", "email", "phone", "website", "is_active", "notes",
      "min_price_delta_eur",
    ]
    const cleanedData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (key in hotelData && hotelData[key] !== undefined) {
        cleanedData[key] = hotelData[key]
      }
    }

    console.log("[v0] PATCH hotel - cleanedData:", cleanedData)

    const { data: hotel, error } = await serviceSupabase
      .from("hotels")
      .update({
        ...cleanedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle()

    if (error) {
      console.error("[v0] Error updating hotel:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }

    // Update or create PMS integration if pms data is provided
    if (pms?.pms_name) {
      console.log("[v0] PATCH hotel - upserting PMS integration:", {
        hotel_id: id,
        pms_name: pms.pms_name,
        has_api_key: !!pms.api_key,
        has_endpoint: !!pms.endpoint_url,
        has_property_id: !!pms.property_id,
        has_vat: !!pms.vat_number,
      })

      const { data: existingPms } = await serviceSupabase
        .from("pms_integrations")
        .select("id")
        .eq("hotel_id", id)
        .maybeSingle()

      const pmsPayload = {
        pms_name: pms.pms_name,
        api_key: pms.api_key || null,
        api_secret: pms.api_secret || null,
        endpoint_url: pms.endpoint_url || null,
        vat_number: pms.vat_number || null,
        property_id: pms.property_id || null,
      }

      if (existingPms) {
        // Update existing -- check error and verify update affected the row
        const { data: updatedPms, error: updateErr } = await serviceSupabase
          .from("pms_integrations")
          .update({
            ...pmsPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPms.id)
          .select()
          .maybeSingle()

        if (updateErr) {
          console.error("[v0] PATCH hotel - PMS update error:", updateErr)
          return NextResponse.json(
            { error: `PMS save failed: ${updateErr.message}` },
            { status: 500 },
          )
        }
        if (!updatedPms) {
          console.error("[v0] PATCH hotel - PMS update did not match any row, id:", existingPms.id)
          return NextResponse.json(
            { error: "PMS save did not affect any row. Please reload and retry." },
            { status: 500 },
          )
        }
        console.log("[v0] PATCH hotel - PMS update OK, id:", updatedPms.id)
      } else {
        // Create new -- check error
        const { data: newPms, error: insertErr } = await serviceSupabase
          .from("pms_integrations")
          .insert({
            hotel_id: id,
            ...pmsPayload,
            is_active: true,
          })
          .select()
          .maybeSingle()

        if (insertErr) {
          console.error("[v0] PATCH hotel - PMS insert error:", insertErr)
          return NextResponse.json(
            { error: `PMS create failed: ${insertErr.message}` },
            { status: 500 },
          )
        }
        console.log("[v0] PATCH hotel - PMS insert OK, id:", newPms?.id)
      }

      // SYNC: When vat_number is set on pms_integrations, also update
      // the parent organization so all forms show the same value.
      if (pms.vat_number && hotel?.organization_id) {
        await serviceSupabase
          .from("organizations")
          .update({ vat_number: pms.vat_number, updated_at: new Date().toISOString() })
          .eq("id", hotel.organization_id)
      }
    }

    return NextResponse.json({ success: true, hotel })
  } catch (error) {
    console.error("[v0] Error in hotel PATCH route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Soft delete hotel
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Verify superadmin access
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // In dev mode (v0 preview), allow access without auth
    const isDevMode = process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview"

    if (!user && !isDevMode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const serviceSupabase = await createServiceRoleClient()

    // Check if hotel exists
    const { data: existingHotel } = await serviceSupabase.from("hotels").select("id, name").eq("id", id).maybeSingle()

    if (!existingHotel) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }

    // Soft delete the hotel
    const { data: hotel, error } = await serviceSupabase
      .from("hotels")
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle()

    if (error) {
      console.error("[v0] Error soft deleting hotel:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, hotel })
  } catch (error) {
    console.error("[v0] Error in hotel DELETE route:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
