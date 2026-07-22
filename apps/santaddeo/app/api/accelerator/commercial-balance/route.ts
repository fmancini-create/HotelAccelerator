import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { addDays, toISODate, type PaceBooking } from "@/lib/pace/compute"
import { computeCommercialBalance, type ObjectiveInput } from "@/lib/accelerator/commercial-balance"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Default: ultimi 60 giorni di attivita' commerciale fino a oggi.
const DEFAULT_RANGE_DAYS = 60

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/accelerator/commercial-balance", handleGET)

async function handleGET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("warm") === "1") {
    return NextResponse.json({ ok: true, warm: true })
  }

  try {
    const { searchParams } = request.nextUrl
    const hotelId = searchParams.get("hotelId")
    if (!hotelId) {
      return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    }

    const denied = await validateHotelAccess(hotelId, null, { allowSeller: "full" })
    if (denied) return denied

    // Condivide l'addon Booking Pace: stessa fonte dati (prenotazioni) e concetto.
    if (!(await hasAddon(hotelId, "booking_pace"))) {
      return NextResponse.json(
        { error: "Addon Booking Pace non attivo", code: "ADDON_REQUIRED" },
        { status: 403 },
      )
    }

    const today = toISODate(new Date())
    const to = searchParams.get("to") || today
    const from = searchParams.get("from") || addDays(to, -(DEFAULT_RANGE_DAYS - 1))

    const supabase = await createServiceRoleClient()

    // Inizio del mese corrente: per l'OTB dei mesi-obiettivo ancora aperti
    // (anche le notti gia' trascorse di questo mese contano nella produzione).
    const todayMonthStart = `${today.slice(0, 7)}-01`
    // Bordo sinistro per la media mobile a 7 giorni.
    const seriesFrom = addDays(from, -6)

    // Un'unica query: prenotazioni che incidono su (a) ricevute nella finestra,
    // (b) cancellate nella finestra, (c) OTB dei mesi di soggiorno aperti.
    const bookings = await fetchAllPaginatedOrLog<PaceBooking>(
      () =>
        supabase
          .from("bookings")
          .select(
            "booking_date, check_in_date, check_out_date, is_cancelled, cancellation_date, number_of_rooms, number_of_nights, total_price, net_price, extras_revenue",
          )
          .eq("hotel_id", hotelId)
          .or(
            `booking_date.gte.${seriesFrom},cancellation_date.gte.${from},check_in_date.gte.${todayMonthStart}`,
          )
          .order("booking_date", { ascending: true }),
      "commercial-balance-bookings",
    )

    // Obiettivi EUR per mese di soggiorno (anno corrente + successivo).
    const yearNow = Number(today.slice(0, 4))
    const { data: objRows } = await supabase
      .from("revenue_objectives")
      .select("year, month, obiettivo_produzione")
      .eq("hotel_id", hotelId)
      .in("year", [yearNow, yearNow + 1])
    const objectives: ObjectiveInput[] = (objRows ?? [])
      .filter((o) => o.obiettivo_produzione != null && Number(o.obiettivo_produzione) > 0)
      .map((o) => ({
        month: `${o.year}-${String(o.month).padStart(2, "0")}`,
        objectiveEur: Number(o.obiettivo_produzione),
      }))

    const result = computeCommercialBalance(bookings, objectives, { today, from, to })

    return NextResponse.json(result)
  } catch (e) {
    console.error("[commercial-balance] error", e)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
