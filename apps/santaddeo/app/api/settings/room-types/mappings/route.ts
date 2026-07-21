import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

interface MappingInput {
  pms_code: string
  pms_label: string
  rms_code: string
  rms_label: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { hotelId, pmsProvider, mappings } = body as {
      hotelId: string
      pmsProvider: string
      mappings: MappingInput[]
    }

    if (!hotelId || !pmsProvider || !mappings || mappings.length === 0) {
      return NextResponse.json({ error: "hotelId, pmsProvider and mappings required" }, { status: 400 })
    }

    let savedCount = 0
    const errors: string[] = []

    for (const mapping of mappings) {
      if (!mapping.pms_code || !mapping.rms_code) continue

      // Check if mapping already exists
      const { data: existing } = await supabase
        .from("pms_rms_mappings")
        .select("id, locked")
        .eq("pms_provider", pmsProvider)
        .eq("pms_entity_type", "room_type")
        .eq("pms_code", mapping.pms_code)
        .eq("hotel_id", hotelId)
        .maybeSingle()

      if (existing) {
        // Update existing mapping (if not locked)
        if (existing.locked) {
          errors.push(`Mappatura ${mapping.pms_code} bloccata, non modificabile`)
          continue
        }

        const { error: updateError } = await supabase
          .from("pms_rms_mappings")
          .update({
            rms_code: mapping.rms_code,
            rms_label: mapping.rms_label,
            pms_label: mapping.pms_label,
          })
          .eq("id", existing.id)

        if (updateError) {
          console.error("[API] Update error:", updateError)
          errors.push(`Errore aggiornamento ${mapping.pms_code}: ${updateError.message}`)
        } else {
          savedCount++
        }
      } else {
        // Insert new mapping
        const { error: insertError } = await supabase
          .from("pms_rms_mappings")
          .insert({
            pms_provider: pmsProvider,
            pms_entity_type: "room_type",
            pms_code: mapping.pms_code,
            pms_label: mapping.pms_label,
            rms_code: mapping.rms_code,
            rms_label: mapping.rms_label,
            hotel_id: hotelId,
            locked: false,
          })

        if (insertError) {
          console.error("[API] Insert error:", insertError)
          errors.push(`Errore inserimento ${mapping.pms_code}: ${insertError.message}`)
        } else {
          savedCount++
        }
      }
    }

    // Also update room_types table to link scidoo_room_type_id
    for (const mapping of mappings) {
      if (!mapping.pms_code || !mapping.rms_code) continue

      // Check if a room_type exists for this hotel that should be linked
      const { data: roomType } = await supabase
        .from("room_types")
        .select("id, scidoo_room_type_id")
        .eq("hotel_id", hotelId)
        .or(`id.eq.${mapping.pms_code},scidoo_room_type_id.eq.${mapping.pms_code}`)
        .maybeSingle()

      if (roomType && !roomType.scidoo_room_type_id) {
        // Update room_type to link scidoo_room_type_id
        await supabase
          .from("room_types")
          .update({ scidoo_room_type_id: mapping.pms_code })
          .eq("id", roomType.id)
      }
    }

    return NextResponse.json({
      saved: savedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error("[API] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
