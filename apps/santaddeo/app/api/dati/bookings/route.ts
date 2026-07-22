import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { measureRoute } from "@/lib/performance/with-perf"

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/dati/bookings", handleGET)

async function handleGET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const hotelId = searchParams.get("hotel_id")
  const startDate = searchParams.get("start_date")
  const endDate = searchParams.get("end_date")
  const filterType = searchParams.get("filter_type") || "checkin"
  const statusFilter = searchParams.get("status") || "all"
  const searchName = searchParams.get("search_name") || ""
  const searchId = searchParams.get("search_id") || ""
  const channelFilter = searchParams.get("channel") || "all"

  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Legge dalla tabella canonica "bookings" (PMS-agnostic)
    // Joinata con room_types per il nome camera.
    // NB: costruiamo la query in una factory perche' la ri-eseguiamo per PAGINA
    // (vedi paginazione sotto): un query builder Supabase non e' riutilizzabile
    // dopo l'await, quindi ne creiamo uno nuovo per ogni range.
    const buildQuery = () => {
      let query = supabase
        .from("bookings")
        .select("*, room_types(code, name)")
        .eq("hotel_id", hotelId)
        .order("booking_date", { ascending: false })
        // Tiebreaker deterministico: senza un ordine stabile la paginazione
        // .range() puo' saltare/duplicare righe con lo stesso booking_date.
        .order("id", { ascending: false })

    if (startDate && endDate) {
      if (filterType === "checkin") {
        query = query
          .gte("check_in_date", startDate)
          .lte("check_in_date", endDate)
      } else if (filterType === "cancellation") {
        // Allineato con dashboard: cancellazioni con soggiorno che overlappa il periodo
        query = query
          .eq("is_cancelled", true)
          .lte("check_in_date", endDate)
          .gt("check_out_date", startDate)
      } else if (filterType === "activity") {
        // Mostra sia nuove prenotazioni che cancellazioni del periodo (come Scidoo)
        // Usa OR con sintassi corretta Supabase:
        // booking_date nel range OPPURE (is_cancelled=true E cancellation_date nel range)
        query = query.or(
          `and(booking_date.gte.${startDate},booking_date.lte.${endDate}),and(is_cancelled.eq.true,cancellation_date.gte.${startDate},cancellation_date.lte.${endDate})`
        )
      } else if (filterType === "imported") {
        // FIX 30/04/2026: filtro per "Sincronizzate dal sistema" — usa
        // imported_at (timestamptz quando la nostra ETL ha visto il booking).
        // Diverso da booking_date che e' la data CREAZIONE nel PMS: una
        // prenotazione fatta nel PMS alle 23:50 del 29/04 ed entrata nel
        // nostro sync alle 00:50 del 30/04 ha booking_date=29/04 ma
        // imported_at=30/04. Questo filtro permette all'utente di vedere
        // "cosa e' arrivato oggi nel sistema" indipendentemente dalla
        // data PMS. Range esteso a +1 giorno perche' imported_at e' un
        // timestamp e startDate/endDate sono date.
        const endPlus1 = new Date(endDate)
        endPlus1.setUTCDate(endPlus1.getUTCDate() + 1)
        const endIso = endPlus1.toISOString().slice(0, 10)
        query = query
          .gte("imported_at", `${startDate}T00:00:00.000Z`)
          .lt("imported_at", `${endIso}T00:00:00.000Z`)
      } else {
        query = query
          .gte("booking_date", startDate)
          .lte("booking_date", endDate)
      }
    }

    if (statusFilter !== "all") {
      if (statusFilter === "cancelled" || statusFilter === "cancellata" || statusFilter === "annullata") {
        query = query.eq("is_cancelled", true)
      } else if (statusFilter === "confirmed" || statusFilter === "confermata") {
        query = query.eq("is_cancelled", false)
      }
    }

    // Filtro per nome ospite (case-insensitive ILIKE)
    if (searchName.trim()) {
      query = query.ilike("guest_name", `%${searchName.trim()}%`)
    }

    // Filtro per ID prenotazione (match parziale)
    if (searchId.trim()) {
      query = query.ilike("pms_booking_id", `%${searchId.trim()}%`)
    }

    // Filtro per canale
    if (channelFilter !== "all") {
      query = query.eq("channel", channelFilter)
    }

      return query
    }

    // Paginazione: Supabase cappa ~1000 righe per richiesta, quindi scorriamo a
    // pagine di 1000 finche' non esauriamo il risultato. Prima l'endpoint faceva
    // .limit(500) -> su "Ultimo Anno" (500+ prenotazioni) footer e ADR erano
    // calcolati su un set TRONCATO = dati falsati. Ora prendiamo TUTTE le righe.
    const PAGE = 1000
    const MAX_PAGES = 50 // safety net: max 50k righe, evita loop infiniti
    const data: any[] = []
    let error: { message: string } | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE
      const { data: pageData, error: pageErr } = await buildQuery().range(from, from + PAGE - 1)
      if (pageErr) {
        error = pageErr
        break
      }
      if (!pageData || pageData.length === 0) break
      data.push(...pageData)
      if (pageData.length < PAGE) break // ultima pagina
    }

    // Ritorna anche la lista dei canali distinti per il filtro
    const { data: channelsData } = await supabase
      .from("bookings")
      .select("channel")
      .eq("hotel_id", hotelId)
      .not("channel", "is", null)
      .limit(1000)
    
    const channels = [...new Set((channelsData || []).map(c => c.channel).filter(Boolean))].sort()

    if (error) {
      console.error("Error fetching bookings:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ bookings: data || [], count: data?.length || 0, channels })
  } catch (error) {
    console.error("Debug bookings API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
