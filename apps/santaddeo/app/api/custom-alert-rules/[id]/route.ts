import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const body = await request.json()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Fetch la regola per ottenere hotel_id
    const { data: existingRule, error: fetchError } = await supabase
      .from("custom_alert_rules")
      .select("hotel_id")
      .eq("id", id)
      .single()

    if (fetchError || !existingRule) {
      return NextResponse.json({ error: "Regola non trovata" }, { status: 404 })
    }

    // Verifica accesso all'hotel
    const denied = await validateHotelAccess(existingRule.hotel_id, user)
    if (denied) return denied

    // Campi aggiornabili
    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.condition_type !== undefined) updateData.condition_type = body.condition_type
    if (body.condition_operator !== undefined) updateData.condition_operator = body.condition_operator
    if (body.condition_value !== undefined) updateData.condition_value = Number(body.condition_value)
    if (body.room_type_id !== undefined) updateData.room_type_id = body.room_type_id || null
    if (body.days_ahead !== undefined) updateData.days_ahead = body.days_ahead
    if (body.notify_email !== undefined) updateData.notify_email = body.notify_email
    if (body.notify_popup !== undefined) updateData.notify_popup = body.notify_popup
    if (body.cooldown_hours !== undefined) updateData.cooldown_hours = body.cooldown_hours

    const { data, error } = await supabase
      .from("custom_alert_rules")
      .update(updateData)
      .eq("id", id)
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
      console.error("[custom-alert-rules] PATCH error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rule: data })
  } catch (error) {
    console.error("[custom-alert-rules] PATCH error:", error)
    return NextResponse.json({ error: "Errore del server" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Fetch la regola per ottenere hotel_id
    const { data: existingRule, error: fetchError } = await supabase
      .from("custom_alert_rules")
      .select("hotel_id")
      .eq("id", id)
      .single()

    if (fetchError || !existingRule) {
      return NextResponse.json({ error: "Regola non trovata" }, { status: 404 })
    }

    // Verifica accesso all'hotel
    const denied = await validateHotelAccess(existingRule.hotel_id, user)
    if (denied) return denied

    const { error } = await supabase
      .from("custom_alert_rules")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[custom-alert-rules] DELETE error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[custom-alert-rules] DELETE error:", error)
    return NextResponse.json({ error: "Errore del server" }, { status: 500 })
  }
}
