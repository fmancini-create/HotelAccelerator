import { createServiceRoleClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

const RMS_CANONICAL_CODES = {
  room_type: [
    { code: "SGL", label: "Single Room" },
    { code: "DBL", label: "Double Room" },
    { code: "TWN", label: "Twin Room" },
    { code: "TRP", label: "Triple Room" },
    { code: "QUD", label: "Quad Room" },
    { code: "STE", label: "Suite" },
    { code: "JST", label: "Junior Suite" },
    { code: "FAM", label: "Family Room" },
    { code: "APT", label: "Apartment" },
    { code: "VIL", label: "Villa" },
    { code: "DLX", label: "Deluxe Room" },
    { code: "SUP", label: "Superior Room" },
    { code: "STD", label: "Standard Room" },
    { code: "ECO", label: "Economy Room" },
  ],
  rate_plan: [
    { code: "BAR", label: "Best Available Rate" },
    { code: "OTA", label: "OTA Rate" },
    { code: "DIR", label: "Direct Rate" },
    { code: "COR", label: "Corporate Rate" },
    { code: "GRP", label: "Group Rate" },
    { code: "PKG", label: "Package Rate" },
    { code: "PRO", label: "Promo Rate" },
    { code: "NRF", label: "Non-Refundable" },
    { code: "FLX", label: "Flexible Rate" },
    { code: "LMD", label: "Last Minute Deal" },
    { code: "EBD", label: "Early Bird" },
    { code: "LON", label: "Long Stay" },
  ],
  channel: [
    { code: "DIR", label: "Direct (Website)" },
    { code: "BKG", label: "Booking.com" },
    { code: "EXP", label: "Expedia" },
    { code: "AIR", label: "Airbnb" },
    { code: "AGD", label: "Agoda" },
    { code: "HRS", label: "HRS" },
    { code: "HTC", label: "Hotels.com" },
    { code: "TRP", label: "TripAdvisor" },
    { code: "GDS", label: "GDS (Amadeus/Sabre)" },
    { code: "PHN", label: "Phone" },
    { code: "WLK", label: "Walk-in" },
    { code: "OTH", label: "Other" },
  ],
  payment_method: [
    { code: "CSH", label: "Cash" },
    { code: "CRD", label: "Credit Card" },
    { code: "BNK", label: "Bank Transfer" },
    { code: "VCH", label: "Voucher" },
    { code: "CMP", label: "Complimentary" },
    { code: "INV", label: "Invoice" },
    { code: "OTA", label: "OTA Collect" },
    { code: "PPL", label: "PayPal" },
    { code: "OTH", label: "Other" },
  ],
  booking_status: [
    { code: "CNF", label: "Confirmed" },
    { code: "CAN", label: "Cancelled" },
    { code: "PND", label: "Pending" },
    { code: "NSH", label: "No-Show" },
    { code: "CIN", label: "Checked-In" },
    { code: "COU", label: "Checked-Out" },
    { code: "MOD", label: "Modified" },
    { code: "WTL", label: "Waitlist" },
  ],
  document_type: [
    { code: "INV", label: "Invoice (Fattura)" },
    { code: "RCP", label: "Receipt (Ricevuta)" },
    { code: "CRN", label: "Credit Note (Nota Credito)" },
    { code: "PRF", label: "Pro-forma" },
    { code: "DEP", label: "Deposit (Caparra)" },
    { code: "OTH", label: "Other" },
  ],
  meal_plan: [
    { code: "RO", label: "Room Only" },
    { code: "BB", label: "Bed & Breakfast" },
    { code: "HB", label: "Half Board" },
    { code: "FB", label: "Full Board" },
    { code: "AI", label: "All Inclusive" },
  ],
}

export async function GET(request: NextRequest) {
  try {
    // Usa createServiceRoleClient per bypassare RLS (l'accesso e gia protetto dalla route /superadmin)
    const supabase = await createServiceRoleClient()

    const { data: pmsProviders, error: providersError } = await supabase.from("pms_providers").select("*").order("name")

    if (providersError) {
      console.error("[API] Error fetching PMS providers:", providersError)
    }

    // Recupera tutte le mappature
    const { data: mappings, error } = await supabase
      .from("pms_rms_mappings")
      .select("*")
      .order("pms_provider")
      .order("pms_entity_type")
      .order("pms_code")

    if (error) {
      console.error("[API] Error fetching mappings:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: hotels } = await supabase.from("hotels").select("id, name").order("name")

    // Room types dal PMS
    const { data: pmsRoomTypes } = await supabase
      .from("room_types")
      .select("id, name, pms_room_type_id")
      .not("pms_room_type_id", "is", null)

    // Canali unici dalle prenotazioni (se esistono)
    const { data: pmsChannels } = await supabase
      .from("scidoo_raw_bookings")
      .select("channel")
      .not("channel", "is", null)
      .limit(1000)

    const uniqueChannels = pmsChannels ? [...new Set(pmsChannels.map((b) => b.channel).filter(Boolean))] : []

    // Rate plans dai rates (se esistono)
    const { data: pmsRates } = await supabase.from("scidoo_raw_rates").select("raw_data").limit(100)

    const uniqueRatePlans: string[] = []
    if (pmsRates) {
      const ratePlanSet = new Set<string>()
      pmsRates.forEach((r) => {
        if (r.raw_data?.rate_plan_id) ratePlanSet.add(String(r.raw_data.rate_plan_id))
        if (r.raw_data?.rate_plan_code) ratePlanSet.add(String(r.raw_data.rate_plan_code))
      })
      uniqueRatePlans.push(...Array.from(ratePlanSet))
    }

    // Document types dalla produzione fiscale (se esistono)
    const { data: pmsFiscal } = await supabase.schema("connectors").from("scidoo_raw_fiscal_production").select("raw_data").limit(100)

    const uniqueDocTypes: string[] = []
    if (pmsFiscal) {
      const docTypeSet = new Set<string>()
      pmsFiscal.forEach((f) => {
        if (f.raw_data?.document_type) docTypeSet.add(String(f.raw_data.document_type))
        if (f.raw_data?.tipo_documento) docTypeSet.add(String(f.raw_data.tipo_documento))
      })
      uniqueDocTypes.push(...Array.from(docTypeSet))
    }

    return NextResponse.json({
      mappings: mappings || [],
      hotels: hotels || [],
      pmsProviders: pmsProviders || [],
      // PMS data per tipo
      pmsData: {
        room_type: (pmsRoomTypes || []).map((rt) => ({
          code: rt.pms_room_type_id,
          label: rt.name,
        })),
        channel: uniqueChannels.map((c) => ({ code: c, label: c })),
        rate_plan: uniqueRatePlans.map((r) => ({ code: r, label: r })),
        document_type: uniqueDocTypes.map((d) => ({ code: d, label: d })),
        booking_status: [], // Solitamente standard, non vengono dal PMS
        payment_method: [], // Solitamente standard
        meal_plan: [], // Solitamente standard
      },
      // RMS canonical codes
      rmsCanonicalCodes: RMS_CANONICAL_CODES,
      // Legacy support
      pmsRoomTypes: pmsRoomTypes || [],
      rmsRoomTypes: RMS_CANONICAL_CODES.room_type.map((rt) => ({
        id: rt.code,
        code: rt.code,
        name: rt.label,
      })),
    })
  } catch (error) {
    console.error("[API] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Usa createServiceRoleClient per bypassare RLS (l'accesso e gia protetto dalla route /superadmin)
    const supabase = await createServiceRoleClient()

    const body = await request.json()
    const { pms_provider, pms_entity_type, pms_code, pms_label, rms_code, rms_label, hotel_id } = body

    if (!pms_provider || !pms_entity_type || !pms_code || !rms_code) {
      console.error("[API] HARDENING BLOCK: Campi obbligatori mancanti", {
        pms_provider,
        pms_entity_type,
        pms_code,
        rms_code,
      })
      return NextResponse.json({ error: "Campi obbligatori mancanti" }, { status: 400 })
    }

    // HARDENING: Verifica che rms_code non sia vuoto o whitespace
    if (typeof rms_code !== "string" || rms_code.trim() === "") {
      console.error("[API] HARDENING BLOCK: rms_code invalido", { rms_code })
      return NextResponse.json({ error: "Codice RMS non valido" }, { status: 400 })
    }

    // HARDENING: Verifica che pms_code non sia vuoto o whitespace
    if (typeof pms_code !== "string" || pms_code.trim() === "") {
      console.error("[API] HARDENING BLOCK: pms_code invalido", { pms_code })
      return NextResponse.json({ error: "Codice PMS non valido" }, { status: 400 })
    }

    // Use UPSERT to handle duplicates - the unique constraint is on (pms_provider, pms_entity_type, pms_code, COALESCE(hotel_id, '00000000-0000-0000-0000-000000000000'))
    // First check if mapping exists and is locked
    const { data: existingMappings } = await supabase
      .from("pms_rms_mappings")
      .select("id, locked")
      .eq("pms_provider", pms_provider)
      .eq("pms_entity_type", pms_entity_type)
      .eq("pms_code", pms_code.trim())

    // Filter for matching hotel_id (including null)
    const existingMapping = existingMappings?.find((m) => {
      // This is a workaround since we can't easily query COALESCE in Supabase
      // We'll check all mappings and find the one that matches
      return true // We'll refetch with proper check below
    })

    // Check if any existing mapping is locked
    if (existingMappings && existingMappings.length > 0) {
      // Need to check the specific one with matching hotel_id
      const { data: exactMatch } = await supabase
        .from("pms_rms_mappings")
        .select("id, locked, hotel_id")
        .eq("pms_provider", pms_provider)
        .eq("pms_entity_type", pms_entity_type)
        .eq("pms_code", pms_code.trim())

      const matchingRecord = exactMatch?.find((m) => {
        if (hotel_id) {
          return m.hotel_id === hotel_id
        }
        return m.hotel_id === null
      })

      if (matchingRecord?.locked) {
        console.error("[API] HARDENING BLOCK: Tentativo di modifica mappatura locked", matchingRecord.id)
        return NextResponse.json({ error: "Mappatura bloccata - non modificabile" }, { status: 403 })
      }

      // UPDATE existing record
      if (matchingRecord) {
        const { data: updated, error: updateError } = await supabase
          .from("pms_rms_mappings")
          .update({
            pms_label: pms_label || pms_code,
            rms_code: rms_code.trim(),
            rms_label: rms_label || rms_code,
          })
          .eq("id", matchingRecord.id)
          .select()
          .single()

        if (updateError) {
          console.error("[API] Update error:", updateError)
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        console.log("[API] HARDENING PASS: Mapping updated successfully", updated?.id)
        return NextResponse.json({ mapping: updated, created: false }, { status: 200 })
      }
    }

    // INSERT new record
    const { data: inserted, error: insertError } = await supabase
      .from("pms_rms_mappings")
      .insert({
        pms_provider,
        pms_entity_type,
        pms_code: pms_code.trim(),
        pms_label: pms_label || pms_code,
        rms_code: rms_code.trim(),
        rms_label: rms_label || rms_code,
        hotel_id: hotel_id || null,
        locked: false,
        created_by: null, // Service role - no user context
      })
      .select()
      .single()

    if (insertError) {
      // If duplicate key error, try to update instead
      if (insertError.code === "23505") {
        console.log("[API] Duplicate detected, attempting update...")
        const { data: retryUpdate, error: retryError } = await supabase
          .from("pms_rms_mappings")
          .update({
            pms_label: pms_label || pms_code,
            rms_code: rms_code.trim(),
            rms_label: rms_label || rms_code,
          })
          .eq("pms_provider", pms_provider)
          .eq("pms_entity_type", pms_entity_type)
          .eq("pms_code", pms_code.trim())
          .select()

        if (retryError) {
          console.error("[API] Retry update error:", retryError)
          return NextResponse.json({ error: retryError.message }, { status: 500 })
        }

        const result = retryUpdate?.[0]
        if (result) {
          console.log("[API] HARDENING PASS: Mapping updated via retry", result.id)
          return NextResponse.json({ mapping: result, created: false }, { status: 200 })
        }
      }

      console.error("[API] Insert error:", insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    if (!inserted || !inserted.rms_code || !inserted.id) {
      console.error("[API] HARDENING BLOCK: Insert returned invalid data", inserted)
      return NextResponse.json({ error: "Errore nella verifica del salvataggio" }, { status: 500 })
    }

    const result = inserted
    console.log("[API] HARDENING PASS: Mapping inserted successfully", result.id)

    return NextResponse.json({ mapping: result, created: !existingMapping }, { status: 200 })
  } catch (error) {
    console.error("[API] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Usa createServiceRoleClient per bypassare RLS (l'accesso e gia protetto dalla route /superadmin)
    const supabase = await createServiceRoleClient()

    const body = await request.json()
    // Il frontend (connectors-mapping-table.tsx) manda l'id come query
    // string ?id=... e nel body i campi della mappatura. Manteniamo la
    // retrocompatibilita' accettandolo anche dal body.
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id") || body.id
    const { rms_code, rms_label, pms_label, pms_code } = body

    if (!id || !rms_code) {
      console.error("[API PATCH mapping] Missing id or rms_code", { id, rms_code, hasBody: !!body })
      return NextResponse.json({ error: "ID e rms_code sono obbligatori" }, { status: 400 })
    }

    if (typeof rms_code !== "string" || rms_code.trim() === "") {
      return NextResponse.json({ error: "Codice RMS non valido" }, { status: 400 })
    }

    // Verifica lock prima dell'update per evitare di sovrascrivere mappature bloccate
    const { data: existing, error: fetchError } = await supabase
      .from("pms_rms_mappings")
      .select("id, locked")
      .eq("id", id)
      .maybeSingle()

    if (fetchError) {
      console.error("[API PATCH mapping] fetch error:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: "Mappatura non trovata" }, { status: 404 })
    }
    if (existing.locked) {
      return NextResponse.json({ error: "Mappatura bloccata - non modificabile" }, { status: 403 })
    }

    const updatePayload: Record<string, unknown> = {
      rms_code: rms_code.trim(),
      rms_label: rms_label || pms_label || pms_code || rms_code,
    }
    // Permetti anche update di pms_label se passato (es. label ricaricata dal PMS)
    if (pms_label) updatePayload.pms_label = pms_label

    const { data: mapping, error } = await supabase
      .from("pms_rms_mappings")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle()

    if (error) {
      console.error("[API PATCH mapping] update error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!mapping) {
      console.error("[API PATCH mapping] update returned no row, id:", id)
      return NextResponse.json({ error: "Update non ha modificato alcuna riga" }, { status: 500 })
    }

    return NextResponse.json({ mapping }, { status: 200 })
  } catch (error) {
    console.error("[API PATCH mapping] exception:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Usa createServiceRoleClient per bypassare RLS (l'accesso e gia protetto dalla route /superadmin)
    const supabase = await createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    console.log("[v0] DELETE mapping request - id:", id)

    if (!id) {
      console.log("[v0] DELETE mapping - missing id")
      return NextResponse.json({ error: "ID obbligatorio" }, { status: 400 })
    }

    // Prima verifica che la mappatura esista
    const { data: existing, error: fetchError } = await supabase
      .from("pms_rms_mappings")
      .select("id")
      .eq("id", id)
      .maybeSingle()

    console.log("[v0] DELETE mapping - existing:", existing, "fetchError:", fetchError)

    if (fetchError) {
      console.error("[v0] DELETE mapping - fetch error:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!existing) {
      // Mappatura non esiste - forse gia eliminata, ritorna successo
      console.log("[v0] DELETE mapping - mapping not found, returning success")
      return NextResponse.json({ success: true, alreadyDeleted: true }, { status: 200 })
    }

    const { error } = await supabase.from("pms_rms_mappings").delete().eq("id", id)

    if (error) {
      console.error("[v0] DELETE mapping error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] DELETE mapping success - id:", id)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error("[v0] DELETE mapping exception:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
