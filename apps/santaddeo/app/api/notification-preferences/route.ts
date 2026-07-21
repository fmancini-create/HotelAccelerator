import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

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

    // Cerca le preferenze esistenti per questo utente/hotel
    const { data: preferences, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .eq("hotel_id", hotelId)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found, che è OK (preferenze non ancora create)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Se non esistono preferenze, ritorna i default
    // NB: le 3 categorie nuove (new_bookings, cancellations, new_reviews)
    // sono opt-in -> default false anche su popup, in modo che gli utenti
    // gia' registrati non ricevano notifiche finche' non le attivano.
    const defaultPreferences = {
      user_id: user.id,
      hotel_id: hotelId,
      pricing_changes_email: false,
      pricing_changes_popup: true,
      pms_push_email: false,
      pms_push_popup: true,
      pricing_errors_email: true,
      pricing_errors_popup: true,
      booking_alerts_email: false,
      booking_alerts_popup: true,
      new_bookings_email: false,
      new_bookings_popup: false,
      cancellations_email: false,
      cancellations_popup: false,
      new_reviews_email: false,
      new_reviews_popup: false,
      pace_alerts_email: false,
      pace_alerts_popup: false,
    }

    return NextResponse.json({ 
      preferences: preferences || defaultPreferences,
      isDefault: !preferences 
    })
  } catch (error) {
    console.error("[notification-preferences] GET error:", error)
    return NextResponse.json({ error: "Errore del server" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { hotelId, ...prefsData } = body

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

    // Upsert delle preferenze
    const { data, error } = await supabase
      .from("notification_preferences")
      .upsert({
        user_id: user.id,
        hotel_id: hotelId,
        ...prefsData,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,hotel_id",
      })
      .select()
      .single()

    if (error) {
      console.error("[notification-preferences] POST error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ preferences: data })
  } catch (error) {
    console.error("[notification-preferences] POST error:", error)
    return NextResponse.json({ error: "Errore del server" }, { status: 500 })
  }
}
