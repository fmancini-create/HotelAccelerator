import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotelId")

    // Verifica autenticazione
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }

    if (!hotelId) {
      return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    }

    // Room types specifici dell'hotel
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, pms_room_type_id, code")
      .eq("hotel_id", hotelId)
      .not("pms_room_type_id", "is", null)

    const { data: bookings } = await supabase
      .from("scidoo_raw_bookings")
      .select("raw_data, channel")
      .eq("hotel_id", hotelId)
      .limit(500)

    const ratePlanMap = new Map<string, { code: string; label: string }>()
    const channelSet = new Set<string>()
    const paymentMethodSet = new Set<string>()
    const mealPlanSet = new Set<string>()

    if (bookings) {
      bookings.forEach((b) => {
        // Rate plans from bookings
        if (b.raw_data?.rate_plan_id) {
          const code = String(b.raw_data.rate_plan_id)
          const label = b.raw_data?.rate_plan_name || b.raw_data?.rate_name || code
          ratePlanMap.set(code, { code, label: String(label) })
        }
        if (b.raw_data?.rate_plan_code) {
          const code = String(b.raw_data.rate_plan_code)
          ratePlanMap.set(code, { code, label: code })
        }
        if (b.raw_data?.rate_code) {
          const code = String(b.raw_data.rate_code)
          ratePlanMap.set(code, { code, label: code })
        }

        // Canali
        if (b.channel) channelSet.add(String(b.channel))
        if (b.raw_data?.channel) channelSet.add(String(b.raw_data.channel))
        if (b.raw_data?.channel_code) channelSet.add(String(b.raw_data.channel_code))
        if (b.raw_data?.source) channelSet.add(String(b.raw_data.source))

        // Metodi pagamento
        if (b.raw_data?.payment_method) paymentMethodSet.add(String(b.raw_data.payment_method))
        if (b.raw_data?.payment_type) paymentMethodSet.add(String(b.raw_data.payment_type))

        // Trattamenti pasti
        if (b.raw_data?.meal_plan) mealPlanSet.add(String(b.raw_data.meal_plan))
        if (b.raw_data?.board) mealPlanSet.add(String(b.raw_data.board))
        if (b.raw_data?.board_code) mealPlanSet.add(String(b.raw_data.board_code))
      })
    }

    const { data: rates, error: ratesError } = await supabase
      .from("scidoo_raw_rates")
      .select("scidoo_rate_id, raw_data")
      .eq("hotel_id", hotelId)
      .limit(500)

    console.log("[v0] scidoo_raw_rates query result:", {
      count: rates?.length,
      error: ratesError?.message,
      sampleRates: rates?.slice(0, 3),
    })

    if (rates && rates.length > 0) {
      rates.forEach((r) => {
        // Il rate Scidoo ha: scidoo_rate_id nella colonna, e raw_data.id, raw_data.name
        const rateId = r.scidoo_rate_id || r.raw_data?.id
        const rateName = r.raw_data?.name || r.raw_data?.rate_name || r.raw_data?.description

        console.log("[v0] Processing rate:", {
          rateId,
          rateName,
          raw_data_keys: r.raw_data ? Object.keys(r.raw_data) : [],
        })

        if (rateId) {
          const code = String(rateId)
          const label = rateName ? String(rateName) : code
          ratePlanMap.set(code, { code, label })
        }
      })
    } else {
      console.log("[v0] No rates found in scidoo_raw_rates for hotel:", hotelId)
    }

    console.log("[v0] Final rate plans:", ratePlanMap.size, Array.from(ratePlanMap.values()))

    const availabilityStatusSet = new Set<string>()
    const { data: availability, error: availError } = await supabase
      .from("scidoo_raw_availability")
      .select("raw_data")
      .eq("hotel_id", hotelId)
      .limit(500)

    if (!availError && availability) {
      availability.forEach((a) => {
        if (a.raw_data?.status) availabilityStatusSet.add(String(a.raw_data.status))
        if (a.raw_data?.availability_status) availabilityStatusSet.add(String(a.raw_data.availability_status))
        if (a.raw_data?.room_status) availabilityStatusSet.add(String(a.raw_data.room_status))
      })
    }

    const minstayTypeSet = new Set<string>()
    const defaultAvailabilityStatuses = ["available", "closed", "sold_out", "on_request", "stop_sale"]
    defaultAvailabilityStatuses.forEach((s) => availabilityStatusSet.add(s))

    const defaultMinstayTypes = ["min_stay", "max_stay", "cta", "ctd", "min_advance", "max_advance"]
    defaultMinstayTypes.forEach((t) => minstayTypeSet.add(t))

    return NextResponse.json({
      room_type: (roomTypes || []).map((rt) => ({
        code: rt.pms_room_type_id || rt.code || rt.id,
        label: rt.name,
      })),
      rate_plan: Array.from(ratePlanMap.values()).filter((r) => r.code),
      channel: Array.from(channelSet)
        .filter(Boolean)
        .map((c) => ({ code: c, label: c })),
      payment_method: Array.from(paymentMethodSet)
        .filter(Boolean)
        .map((p) => ({ code: p, label: p })),
      meal_plan: Array.from(mealPlanSet)
        .filter(Boolean)
        .map((m) => ({ code: m, label: m })),
      availability: Array.from(availabilityStatusSet)
        .filter(Boolean)
        .map((a) => ({ code: a, label: a })),
      minstay: Array.from(minstayTypeSet)
        .filter(Boolean)
        .map((m) => ({ code: m, label: m })),
    })
  } catch (error) {
    console.error("[API] Error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
