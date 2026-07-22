import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  const supabase = await createServiceRoleClient()

  try {
    const body = await request.json()
    const { hotel_id, pms_name, api_key, vat_number, endpoint_url, property_id } = body
    
    console.log("[v0] hotel-api-key POST - Received:", { hotel_id, pms_name, has_api_key: !!api_key, property_id })

    if (!hotel_id || !pms_name) {
      console.log("[v0] hotel-api-key POST - Missing required fields")
      return NextResponse.json(
        { error: "hotel_id e pms_name sono obbligatori" },
        { status: 400 }
      )
    }

    // Check if pms_integrations record exists for this hotel
    const { data: existing, error: selectError } = await supabase
      .from("pms_integrations")
      .select("id")
      .eq("hotel_id", hotel_id)
      .maybeSingle()
    
    console.log("[v0] hotel-api-key POST - Existing record:", { existing, selectError })

    if (existing) {
      // Update existing
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (api_key !== undefined) updateData.api_key = api_key
      if (vat_number !== undefined) updateData.vat_number = vat_number
      if (endpoint_url !== undefined) updateData.endpoint_url = endpoint_url
      if (property_id !== undefined) updateData.property_id = property_id

      const { error } = await supabase
        .from("pms_integrations")
        .update(updateData)
        .eq("id", existing.id)

      console.log("[v0] hotel-api-key POST - Update result:", { error })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    } else {
      // Insert new record
      console.log("[v0] hotel-api-key POST - Inserting new record")
      const { error } = await supabase
        .from("pms_integrations")
        .insert({
          hotel_id,
          pms_name,
          api_key: api_key || null,
          vat_number: vat_number || null,
          endpoint_url: endpoint_url || "https://www.scidoo.com/api/v1",
          property_id: property_id || null,
          is_active: true,
        })

      console.log("[v0] hotel-api-key POST - Insert result:", { error })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    // SYNC: When vat_number is set on pms_integrations, also update
    // the parent organization so all forms show the same value.
    if (vat_number) {
      const { data: hotel } = await supabase
        .from("hotels")
        .select("organization_id")
        .eq("id", hotel_id)
        .maybeSingle()

      if (hotel?.organization_id) {
        await supabase
          .from("organizations")
          .update({ vat_number, updated_at: new Date().toISOString() })
          .eq("id", hotel.organization_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
