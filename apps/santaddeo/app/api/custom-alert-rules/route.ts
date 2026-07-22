import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

const CONDITION_TYPES = ["rooms_remaining", "rooms_remaining_by_type"] as const
const CONDITION_OPERATORS = ["lte", "gte", "eq"] as const

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica accesso all'hotel
    const denied = await validateHotelAccess(hotelId, user)
    if (denied) return denied

    // Fetch regole con join su room_types per il nome
    const { data: rules, error } = await supabase
      .from("custom_alert_rules")
      .select(`
        *,
        room_type:room_types(id, name)
      `)
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Conta le regole attive
    const activeCount = (rules || []).filter(r => r.is_active).length

    return NextResponse.json({ 
      rules: rules || [],
      activeCount,
      maxActive: 5
    })
  } catch (error) {
    console.error("[custom-alert-rules] GET error:", error)
    return NextResponse.json({ error: "Errore del server" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { 
      hotelId, 
      name, 
      condition_type, 
      condition_operator, 
      condition_value,
      room_type_id,
      days_ahead,
      notify_email,
      notify_popup,
      cooldown_hours,
      is_active 
    } = body

    if (!hotelId || !name || !condition_type || !condition_operator || condition_value === undefined) {
      return NextResponse.json({ 
        error: "Campi richiesti: hotelId, name, condition_type, condition_operator, condition_value" 
      }, { status: 400 })
    }

    // Validazione tipi
    if (!CONDITION_TYPES.includes(condition_type)) {
      return NextResponse.json({ 
        error: `condition_type deve essere uno di: ${CONDITION_TYPES.join(", ")}` 
      }, { status: 400 })
    }

    if (!CONDITION_OPERATORS.includes(condition_operator)) {
      return NextResponse.json({ 
        error: `condition_operator deve essere uno di: ${CONDITION_OPERATORS.join(", ")}` 
      }, { status: 400 })
    }

    if (condition_type === "rooms_remaining_by_type" && !room_type_id) {
      return NextResponse.json({ 
        error: "room_type_id richiesto per condition_type 'rooms_remaining_by_type'" 
      }, { status: 400 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica accesso all'hotel
    const denied = await validateHotelAccess(hotelId, user)
    if (denied) return denied

    // Inserisci la regola (il trigger DB verifica il limite di 5 attive)
    const { data, error } = await supabase
      .from("custom_alert_rules")
      .insert({
        hotel_id: hotelId,
        created_by: user.id,
        name,
        condition_type,
        condition_operator,
        condition_value: Number(condition_value),
        room_type_id: room_type_id || null,
        days_ahead: days_ahead || 7,
        notify_email: notify_email ?? true,
        notify_popup: notify_popup ?? true,
        cooldown_hours: cooldown_hours || 24,
        is_active: is_active ?? true,
      })
      .select(`
        *,
        room_type:room_types(id, name)
      `)
      .single()

    if (error) {
      // Gestisci errore limite 5 regole
      if (error.message.includes("Maximum 5 active alert rules")) {
        return NextResponse.json({ 
          error: "Limite raggiunto: massimo 5 regole attive per hotel" 
        }, { status: 400 })
      }
      console.error("[custom-alert-rules] POST error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rule: data })
  } catch (error) {
    console.error("[custom-alert-rules] POST error:", error)
    return NextResponse.json({ error: "Errore del server" }, { status: 500 })
  }
}
