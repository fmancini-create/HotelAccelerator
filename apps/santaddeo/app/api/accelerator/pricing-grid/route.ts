import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { supabaseRetry } from "@/lib/supabase/retry"
import { fetchAllPaginated } from "@/lib/supabase/paginate"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { NextRequest, NextResponse } from "next/server"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"

// FIX 15/07/2026 (vista 3 mesi "spesso non carica"): con finestra a 3 mesi
// Barronci = ~21k righe pricing_grid (21 pagine) + ~4.4k algo params (5
// pagine), fetch sequenziali. Col default 30s la route andava spesso in 504
// sotto latenza prod -> il client mostrava OUTAGE o dati parziali cached.
// Stesso fix gia' applicato a pricing-params (maxDuration 60).
export const maxDuration = 60

// 14/07/2026: strumentata con measureRoute (wrapper leggero, solo tempo
// totale) per rendere rappresentativa la dashboard /admin/performance.
export const GET = measureRoute("/api/accelerator/pricing-grid", handleGET)
export const POST = measureRoute("/api/accelerator/pricing-grid", handlePOST)

// GET: fetch pricing grid for a hotel within a date range
async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotel_id")
    const monthStart = searchParams.get("month_start")
    const monthEnd = searchParams.get("month_end")
    const rateId = searchParams.get("rate_id") // optional filter
    const occupancy = searchParams.get("occupancy") // optional filter

    if (!hotelId || !monthStart || !monthEnd) {
      return NextResponse.json(
        { error: "hotel_id, month_start, and month_end required" },
        { status: 400 }
      )
    }

    // FIX 03/05/2026 (incident "in dev v0 la pagina e' vuota, in prod
    // funziona, stesso DB"): usiamo getAuthUserOrDev che torna un
    // SERVICE-ROLE client in dev (bypassa RLS) e un cookie-bound client
    // in prod (rispetta RLS). createClient() puro funzionava in prod ma
    // in dev v0, dove non c'e' una sessione Supabase reale, le RLS
    // ritornavano silenziosamente 0 righe per room_types/rates/etc,
    // facendo apparire l'hotel come "nessuna tariffa configurata".
    // L'auth gating per hotel resta invariato via validateHotelAccess.
    const { user, supabase } = await getAuthUserOrDev()

    // BUG FIX 30/04/2026 (audit globale): verifica che l'utente abbia
    // accesso a questo hotel. Senza questa verifica, qualsiasi utente
    // loggato poteva leggere il pricing di QUALSIASI hotel sul SaaS.
    // Passiamo `user` (gia' risolto sopra) per evitare un secondo
    // auth.getUser() round-trip (perf 03/05/2026).
    const denied = await validateHotelAccess(hotelId, user, { allowSeller: "full" })
    if (denied) return denied

    // Build the prices query as a factory (may have optional filters).
    // Must be a factory because each pagination iteration needs a fresh builder instance.
    // A single month of pricing_grid for one hotel can easily exceed 1000 rows
    // (e.g. Villa I Barronci April 2026 = 8349 rows: room_types x rates x occupancy x days).
    // Vedi nota su buildAlgoParamsQuery piu' sotto (15/05/2026): senza un
    // ordering completo la paginazione PostgREST puo' perdere righe quando
    // il cron pricing aggiorna le righe a meta' fetch. Aggiungiamo le
    // colonne tie-breaker (room_type_id, rate_id, occupancy) cosi' l'ordine
    // e' totalmente deterministico anche tra paginate consecutive su
    // pricing_grid (mese pieno Barronci = 8349 righe).
    const buildPricesQuery = () => {
      // PERF 15/07/2026: la route mappa solo room_type_id/rate_id/occupancy/
      // date/price (vedi pricesMap). pricing_grid ha 14 colonne: select("*")
      // trasferiva e parsificava ~3x i dati necessari su ~21k righe (3 mesi
      // Barronci). Selezioniamo solo le 5 colonne usate -> payload molto piu'
      // leggero, principale voce di costo di /api/accelerator/pricing-grid
      // (media 2569ms nel report perf).
      let q: any = supabase
        .from("pricing_grid")
        .select("room_type_id, rate_id, occupancy, date, price")
        .eq("hotel_id", hotelId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: true })
        .order("room_type_id", { ascending: true })
        .order("rate_id", { ascending: true })
        .order("occupancy", { ascending: true })
      if (rateId) q = q.eq("rate_id", rateId)
      if (occupancy) q = q.eq("occupancy", parseInt(occupancy, 10))
      return q
    }

    // FIX 15/05/2026 (incident Barronci K-driven variabili "vuote dal 20/06"):
    // PostgREST cappa ogni risposta a 1000 righe; un mese di Villa I Barronci
    // ha ~54 param keys x 30 giorni = 1620 righe -> serve `fetchAllPaginated`.
    // Pero' la paginazione fatta da quel helper si basa su .range() puro: SENZA
    // un ORDER BY deterministico, PostgREST e' libero di restituire righe in
    // ordini diversi tra una pagina e l'altra, soprattutto quando il cron
    // pricing aggiorna le righe a meta' fetch. Risultato: la 2a pagina (riga
    // 1001-1620) puo' duplicare righe della 1a pagina e PERDERE quelle nuove
    // -> nello screenshot dell'utente, tutte le `var_k_*` dal 20/06 in poi
    // erano popolate nel DB ma assenti dall'oggetto restituito al client,
    // quindi il render mostrava il placeholder "5" (default weight).
    // Aggiungiamo `.order("date").order("param_key")` per garantire un
    // ordinamento stabile e univoco fra tutte le pagine.
    const buildAlgoParamsQuery = () =>
      supabase
        .from("pricing_algo_params")
        .select("param_key, param_value, date")
        .eq("hotel_id", hotelId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: true })
        .order("param_key", { ascending: true })

    // FIX 13/05/2026 (incident Barronci): client SERVICE-ROLE usato SOLO per
    // le tabelle di configurazione `hotel_occupancy_bands` e
    // `last_minute_level_discounts` (vedi commenti più sotto). In PROD le RLS
    // su queste due tabelle bloccavano silenziosamente la lettura per gli
    // utenti accelerator, generando `shared_bands=[]` lato client e quindi
    // l'effetto "tutti gli sconti a 0%" nel dropdown e nella riga "Livello
    // Last Minute". Tutte le altre tabelle continuano a passare per
    // `supabase` (cookie-bound + RLS) — questo NON allenta le policy, espone
    // solo i 2 lookup di config previo validateHotelAccess.
    const adminClient = await createServiceRoleClient()

    // Run ALL independent queries in parallel to avoid Supabase rate limits
    // NOTE: last_minute_level_discounts is fetched in a SECOND step below
    // because we need the level IDs first (the previous !inner join filter
    // proved unreliable: PostgREST does not always apply the nested
    // `last_minute_levels.hotel_id=eq.X` filter when combined with a
    // `!inner(...)` select that has column hints, returning 0 rows even
    // though RLS would have allowed them).
    const [
      roomTypesResult,
      ratesResult,
      pricesResult,
      availResult,
      algoParamsResult,
      bandGroupsResult,
      bandsResult,
      lmLevelsResult,
      hotelOccBandsResult,
    ] = await Promise.all([
      // 1. Room types
      supabase
        .from("room_types")
        .select("id, name, code, scidoo_room_type_id, capacity, capacity_default, min_occupancy, max_occupancy, additional_beds, total_rooms, is_active, display_order")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("name"),
      // 2. Active rates (include arrangements, raw_data, and mapping fields)
      supabase
        .from("rates")
        .select("id, hotel_id, name, code, scidoo_rate_id, is_active, room_type_ids, arrangements, raw_data, rate_type, parent_rate_id, discount_percentage, release_days, applicable_room_type_ids, min_occupancy, max_occupancy, is_mapped")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .order("name"),
      // 3. Pricing grid entries - paginated because a single month can exceed 1000 rows
      fetchAllPaginated<any>(buildPricesQuery),
      // 4. Daily availability
      // FIX 15/07/2026 (vista 3 mesi: occupancy troncata da meta' settembre):
      // 3 mesi x 13 tipologie Barronci = 1.196 righe > cap PostgREST 1000.
      // La query singola veniva troncata IN SILENZIO -> gli ultimi ~15 giorni
      // della finestra mostravano occupazione/camere vendute vuote pur avendo
      // dati nel DB. Paginazione con ordine univoco (date + room_type_id),
      // stessa regola degli altri fetch (vedi memoria push-grid-1000-cap).
      fetchAllPaginated<any>(() =>
        supabase
          .from("daily_availability")
          .select("date, room_type_id, rooms_available, total_rooms")
          .eq("hotel_id", hotelId)
          .gte("date", monthStart)
          .lte("date", monthEnd)
          .order("date", { ascending: true })
          .order("room_type_id", { ascending: true }),
      ),
      // 5. Algo params - paginated (Villa I Barronci April 2026 = 1113 rows, exceeds 1000 cap)
      fetchAllPaginated<any>(buildAlgoParamsQuery),
      // 6. Band groups (with nested bands)
      supabase
        .from("occupancy_band_groups")
        .select("*, occupancy_bands(*)")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      // 7. Bands (standalone, hotel-level bands not linked to a group)
      supabase
        .from("occupancy_bands")
        .select("*")
        .eq("hotel_id", hotelId)
        .is("group_id", null)
        .order("band_index", { ascending: true }),
      // 8. Last minute levels
      supabase
        .from("last_minute_levels")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      // 9. Hotel occupancy bands (NUOVA STRUTTURA - fasce condivise per hotel)
      // FIX 13/05/2026 (incident Barronci "dropdown Last Minute mostra tutti
      // gli sconti a 0%"): usiamo un client SERVICE-ROLE per questa tabella
      // di configurazione perché le RLS in PROD bloccano silenziosamente la
      // lettura con cookie-bound client per utenti accelerator → il client
      // riceveva `shared_bands=[]` → ogni livello rendererizzato come "(0%)"
      // sia nel dropdown sia nella cella della riga "Livello Last Minute".
      // Sicurezza: l'accesso all'hotel è già validato a monte da
      // validateHotelAccess(hotelId, user); il filtro `.eq("hotel_id", hotelId)`
      // sotto limita comunque la lettura ai dati di un solo hotel.
      adminClient
        .from("hotel_occupancy_bands")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
    ])

    // 10. Last minute level discounts (NUOVA STRUTTURA - matrice livello×fascia→sconto)
    // Fetch via explicit level_ids list (avoids fragile PostgREST !inner filter).
    // BUG FIX 12/05/2026: prima usavamo
    //   .select("*, last_minute_levels!inner(hotel_id)")
    //   .eq("last_minute_levels.hotel_id", hotelId)
    // ma PostgREST in alcuni casi non applicava il filtro nested, ritornando
    // 0 righe → la UI mostrava ogni livello come "(0%)" anche se il DB aveva
    // 48 record di sconti positivi. Switch a `.in("level_id", levelIds)` che
    // è banale, parallelizzabile su Supabase, e sempre applica il filtro.
    //
    // FIX 13/05/2026 (incident Barronci): stesso problema RLS di
    // `hotel_occupancy_bands` sopra → letto via service-role. I `levelIds`
    // derivano da `lmLevelsResult` che è già filtrato per hotel_id, quindi
    // l'isolamento per hotel resta garantito.
    const levelIds: string[] = ((lmLevelsResult.data || []) as Array<{ id: string }>).map((l) => l.id)
    const lmLevelDiscountsResult = levelIds.length > 0
      ? await adminClient
          .from("last_minute_level_discounts")
          .select("*")
          .in("level_id", levelIds)
      : { data: [] as any[], error: null as any }

    // Check for critical errors in main queries
    if (roomTypesResult.error) {
      console.error("[v0] roomTypes error:", roomTypesResult.error)
      return NextResponse.json({ error: "Failed to load room types: " + roomTypesResult.error.message }, { status: 500 })
    }
    if (ratesResult.error) {
      console.error("[v0] rates error:", ratesResult.error)
      return NextResponse.json({ error: "Failed to load rates: " + ratesResult.error.message }, { status: 500 })
    }
    
    const roomTypes = roomTypesResult.data
    const rates = ratesResult.data
    const prices = pricesResult.data
    const availability = availResult.data
    const algoParams = algoParamsResult.data
    const bandGroups = bandGroupsResult.data
    const occupancyBands = bandsResult.data
    const lastMinuteLevelsRaw = lmLevelsResult.data
    // New tables may fail due to RLS - handle gracefully
    const hotelOccBands = hotelOccBandsResult.data || []
    const lmLevelDiscounts = lmLevelDiscountsResult.data || []
    
    // Log if new tables had errors (non-blocking)
    if (hotelOccBandsResult.error) {
      console.warn("[v0] hotel_occupancy_bands error (non-blocking):", hotelOccBandsResult.error.message)
    }
    if (lmLevelDiscountsResult.error) {
      console.warn("[v0] last_minute_level_discounts error (non-blocking):", lmLevelDiscountsResult.error.message)
    }
    
    // NUOVA STRUTTURA: Join hotel_occupancy_bands + last_minute_level_discounts ai livelli
    // Ogni livello avrà un array di { band, discount } per il calcolo.
    //
    // FIX 12/05/2026: cast esplicito a Number su discount_pct/discount_eur.
    // PostgREST serializza NUMERIC come STRINGA (es. "20.00") per evitare
    // perdita di precisione. Senza il cast, il client (pricing UI) e il
    // motore (calculate-suggested-price) facevano confronti `> 0` / `Math.min`
    // su stringhe → in alcuni branch il valore era trattato come 0,
    // mostrando "(0%)" nel dropdown e applicando sconto 0 nel calcolo.
    const lastMinuteLevels = (lastMinuteLevelsRaw || []).map((level: any) => {
      // Trova tutti gli sconti per questo livello
      const levelDiscounts = lmLevelDiscounts.filter((d: any) => d.level_id === level.id)
      
      // Costruisci l'array di bande con i relativi sconti
      const bandsWithDiscounts = hotelOccBands.map((band: any) => {
        const discount = levelDiscounts.find((d: any) => d.band_id === band.id)
        return {
          band_id: band.id,
          min_rooms: band.min_rooms,
          max_rooms: band.max_rooms,
          sort_order: band.sort_order,
          discount_pct: discount?.discount_pct != null ? Number(discount.discount_pct) : 0,
          discount_eur: discount?.discount_eur != null ? Number(discount.discount_eur) : null,
          discount_mode: discount?.discount_mode ?? 'pct',
        }
      }).sort((a: any, b: any) => a.sort_order - b.sort_order)
      
      return {
        ...level,
        // Nuova struttura con fasce condivise
        shared_bands: bandsWithDiscounts,
        // Mantieni anche occupancy_bands vuoto per retrocompatibilità
        occupancy_bands: [],
      }
    })

    // Diagnostic log: se l'hotel ha livelli + bande configurati MA nessuno sconto
    // popolato, è un segnale che la matrice è mai stata salvata oppure che
    // la query degli sconti ha fallito. In entrambi i casi la pricing UI
    // mostrerà tutti i livelli come (0%) e il motore non applicherà LM.
    if (
      (lastMinuteLevelsRaw?.length || 0) > 0 &&
      hotelOccBands.length > 0 &&
      lmLevelDiscounts.length === 0
    ) {
      console.warn("[pricing-grid][LM discounts empty]", {
        hotelId,
        levels_count: lastMinuteLevelsRaw?.length || 0,
        bands_count: hotelOccBands.length,
        level_ids_searched: levelIds.length,
        discounts_query_error: lmLevelDiscountsResult.error?.message || null,
      })
    }

    console.log("[v0] pricing-grid paginated fetch:", {
      hotelId,
      monthStart,
      monthEnd,
      pricesRowsFetched: (prices || []).length,
      algoParamsRowsFetched: (algoParams || []).length,
      pricesError: pricesResult.error?.message,
      algoParamsError: algoParamsResult.error?.message,
    })

    if (roomTypesResult.error) {
      console.error("Error fetching room types:", roomTypesResult.error)
      return NextResponse.json({ error: roomTypesResult.error.message }, { status: 500 })
    }
    if (pricesResult.error) {
      console.error("Error fetching pricing_grid:", pricesResult.error)
      return NextResponse.json({ error: pricesResult.error.message }, { status: 500 })
    }
    if (algoParamsResult.error) {
      console.error("Error fetching pricing_algo_params:", algoParamsResult.error)
      return NextResponse.json({ error: algoParamsResult.error.message }, { status: 500 })
    }

    // Check for errors in band groups, occupancy bands, and last minute levels
    if (bandGroupsResult.error) {
      console.error("[PRICING-GRID] Error fetching occupancy_band_groups:", JSON.stringify(bandGroupsResult.error))
      return NextResponse.json({ error: `Error fetching band groups: ${bandGroupsResult.error.message}`, details: bandGroupsResult.error }, { status: 500 })
    }
    if (bandsResult.error) {
      console.error("[PRICING-GRID] Error fetching occupancy_bands:", JSON.stringify(bandsResult.error))
      return NextResponse.json({ error: `Error fetching bands: ${bandsResult.error.message}`, details: bandsResult.error }, { status: 500 })
    }
    if (lmLevelsResult.error) {
      console.error("[PRICING-GRID] Error fetching last_minute_levels:", JSON.stringify(lmLevelsResult.error))
      return NextResponse.json({ error: `Error fetching last minute levels: ${lmLevelsResult.error.message}`, details: lmLevelsResult.error }, { status: 500 })
    }
    if (hotelOccBandsResult.error) {
      // Non-blocking: log warning but continue (bands are optional)
      console.warn("[PRICING-GRID] Error fetching hotel_occupancy_bands:", JSON.stringify(hotelOccBandsResult.error))
    }

    // Warn if band groups are empty
    if (!bandGroups || bandGroups.length === 0) {
      console.warn("[PRICING-GRID] No occupancy band groups found for hotel:", hotelId)
    }

    // Build occupancy map: { room_type_id: { date: { available, total } } }
    const occupancyMap: Record<string, Record<string, { available: number; total: number }>> = {}
    for (const row of availability || []) {
      if (!occupancyMap[row.room_type_id]) {
        occupancyMap[row.room_type_id] = {}
      }
      occupancyMap[row.room_type_id][row.date] = {
        available: row.rooms_available ?? 0,
        total: row.total_rooms ?? 0,
      }
    }

    // =====================================================================
    // OCCUPANCY ENRICHMENT for GSheets/Bedzzle hotels:
    // If daily_availability is empty/incomplete, supplement from:
    // 1. daily_production (has rooms_occupied, total_rooms from GSheets sync)
    // 2. bookings table (compute occupied rooms per day)
    // Same approach as /dati/rooms-sold which works correctly for Casanova
    // =====================================================================
    const totalRoomsHotel = (roomTypes || []).reduce((s: number, r: any) => s + (r.total_rooms || 0), 0) || 5
    const aggRtId = (roomTypes || [])[0]?.id || "aggregate"

    // Collect dates already covered by daily_availability
    const coveredDates = new Set<string>()
    for (const rtData of Object.values(occupancyMap)) {
      for (const d of Object.keys(rtData)) coveredDates.add(d)
    }

    // Helper: iterate dates as YYYY-MM-DD strings (timezone-safe)
    function* dateRange(startStr: string, endStr: string): Generator<string> {
      const [sy, sm, sd] = startStr.split("-").map(Number)
      const [ey, em, ed] = endStr.split("-").map(Number)
      const start = new Date(Date.UTC(sy, sm - 1, sd))
      const end = new Date(Date.UTC(ey, em - 1, ed))
      for (let d = start; d < end; d.setUTCDate(d.getUTCDate() + 1)) {
        yield d.toISOString().split("T")[0]
      }
    }

    // PERF 15/07/2026: i due fallback occupancy (daily_production + bookings)
    // servono SOLO a riempire le date della finestra prive di daily_availability
    // (hotel GSheets/Bedzzle senza feed disponibilita' completo). Prima giravano
    // SEMPRE, aggiungendo 2 round-trip sequenziali al percorso critico anche per
    // hotel come Barronci che hanno daily_availability completa. Ora calcoliamo
    // le date scoperte e, se la finestra e' gia' interamente coperta, saltiamo
    // ENTRAMBE le query. Semantica invariata: i fallback riempivano comunque solo
    // le date scoperte.
    const allWindowDates: string[] = []
    for (const d of dateRange(monthStart, monthEnd)) allWindowDates.push(d)
    allWindowDates.push(monthEnd) // dateRange e' end-exclusive
    const hasUncoveredDates = allWindowDates.some((d) => !coveredDates.has(d))

    // Dichiarato fuori dalla guardia cosi' il log diagnostico piu' sotto resta valido.
    let dpData: Array<{ date: string; total_rooms: number | null; rooms_occupied: number | null }> = []

    if (hasUncoveredDates) {
      // Fallback 1: daily_production
      const dpRes = await supabase
        .from("daily_production")
        .select("date, total_rooms, rooms_occupied")
        .eq("hotel_id", hotelId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
      dpData = dpRes.data || []

      if (dpData.length > 0) {
        if (!occupancyMap[aggRtId]) occupancyMap[aggRtId] = {}
        for (const dp of dpData) {
          if (coveredDates.has(dp.date)) continue
          const total = dp.total_rooms || totalRoomsHotel
          const occupied = dp.rooms_occupied || 0
          occupancyMap[aggRtId][dp.date] = {
            available: Math.max(0, total - occupied),
            total,
          }
          coveredDates.add(dp.date)
        }
      }
    }

    // Fallback 2: compute from bookings for remaining uncovered dates
    if (hasUncoveredDates && (roomTypes || []).length > 0) {
      // Fetch bookings for the month
      const { data: monthBookings } = await supabase
        .from("bookings")
        .select("room_type_id, check_in_date, check_out_date, is_cancelled")
        .eq("hotel_id", hotelId)
        .eq("is_cancelled", false)
        .lte("check_in_date", monthEnd)
        .gt("check_out_date", monthStart)

      if (!occupancyMap[aggRtId]) occupancyMap[aggRtId] = {}

      // First fill all uncovered dates with 0 occupied
      for (const dateStr of dateRange(monthStart, monthEnd)) {
        if (coveredDates.has(dateStr)) continue
        occupancyMap[aggRtId][dateStr] = { available: totalRoomsHotel, total: totalRoomsHotel }
        coveredDates.add(dateStr)
      }
      // Also cover monthEnd
      if (!coveredDates.has(monthEnd)) {
        occupancyMap[aggRtId][monthEnd] = { available: totalRoomsHotel, total: totalRoomsHotel }
      }

      // Count occupied from bookings (only for dates filled by bookings fallback)
      const dpDates = new Set((dpData || []).map((dp: any) => dp.date))
      const availDates = new Set((availability || []).map((a: any) => a.date))

      for (const booking of (monthBookings || [])) {
        const checkinStr = booking.check_in_date?.split("T")[0]
        const checkoutStr = booking.check_out_date?.split("T")[0]
        if (!checkinStr || !checkoutStr) continue
        for (const dateStr of dateRange(checkinStr, checkoutStr)) {
          if (dateStr >= monthStart && dateStr <= monthEnd) {
            // Only adjust dates NOT already set by dp or availability
            if (!dpDates.has(dateStr) && !availDates.has(dateStr) && occupancyMap[aggRtId]?.[dateStr]) {
              occupancyMap[aggRtId][dateStr].available = Math.max(0, occupancyMap[aggRtId][dateStr].available - 1)
            }
          }
        }
      }
    }

    // Build prices map: { `${room_type_id}_${rate_id}_${occupancy}`: { date: price } }
    const pricesMap: Record<string, Record<string, number>> = {}
    for (const p of prices || []) {
      const key = `${p.room_type_id}_${p.rate_id}_${p.occupancy}`
      if (!pricesMap[key]) {
        pricesMap[key] = {}
      }
      pricesMap[key][p.date] = parseFloat(p.price)
    }

    // Build params map: { param_key: { date: value } }
    const paramsMap: Record<string, Record<string, string>> = {}
    for (const p of algoParams || []) {
      if (!paramsMap[p.param_key]) {
        paramsMap[p.param_key] = {}
      }
      if (p.date) {
        paramsMap[p.param_key][p.date] = p.param_value
      }
    }

    // Build groups with nested bands
    // Bands come from the nested select (g.occupancy_bands) since they are linked via group_id
    const groupsWithBands = (bandGroups || []).map((g: any) => {
      const nestedBands = (g.occupancy_bands || []).sort((a: any, b: any) => (a.band_index ?? 0) - (b.band_index ?? 0))
      return {
        ...g,
        bands: nestedBands,
        occupancy_bands: undefined, // clean up the nested key
      }
    })

    // Debug: log occupancy enrichment results
    const occKeys = Object.keys(occupancyMap)
    const occDateCount = occKeys.reduce((s, k) => s + Object.keys(occupancyMap[k]).length, 0)
    console.log("[v0] pricing-grid occupancy:", {
      hotelId,
      dailyAvailRows: (availability || []).length,
      dpRows: (dpData || []).length,
      occRoomTypes: occKeys.length,
      occDateCount,
      coveredDatesCount: coveredDates.size,
      sampleDates: occKeys[0] ? Object.keys(occupancyMap[occKeys[0]]).slice(0, 3).map(d => ({
        date: d,
        available: occupancyMap[occKeys[0]][d]?.available,
        total: occupancyMap[occKeys[0]][d]?.total,
      })) : [],
    })

    return NextResponse.json({
      roomTypes: roomTypes || [],
      rates: rates || [],
      prices: pricesMap,
      occupancy: occupancyMap,
      algoParams: paramsMap,
      occupancyBands: occupancyBands || [],
      bandGroups: groupsWithBands,
      lastMinuteLevels: lastMinuteLevels || [],
    })
  } catch (error) {
    console.error("Pricing grid GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    )
  }
}

// POST: save/upsert prices in bulk with ATOMIC transaction via RPC
// Accepts: { hotel_id, entries[], source?, changed_by? }
// source: "manual_grid" | "drag_fill" | "bulk_fill" | "publish_suggested" | "autopilot_push" | "autopilot_calculated"
// 
// ATOMICITY GUARANTEE:
// Calls upsert_prices_atomic() RPC which in a single PostgreSQL transaction:
// 1. Fetches old price for each cell
// 2. Upserts into pricing_grid
// 3. Inserts into price_change_log (only if price changed: old_price IS DISTINCT FROM new_price)
// 4. Returns counts or ROLLS BACK entirely if any step fails
async function handlePOST(request: NextRequest) {
  console.log("[v0] [pricing-grid POST] START - received request")
  try {
    const body = await request.json()
    let { hotel_id, entries, source = "manual_grid", changed_by = null } = body
    console.log("[v0] [pricing-grid POST] hotel_id:", hotel_id, "entries count:", entries?.length, "source:", source)

    // entries: Array<{ room_type_id, rate_id, occupancy, date, price }>
    if (!hotel_id || !entries || !Array.isArray(entries) || entries.length === 0) {
      console.log("[v0] [pricing-grid POST] REJECTED - missing hotel_id or entries")
      return NextResponse.json(
        { error: "hotel_id and entries[] required" },
        { status: 400 }
      )
    }

    // BUG FIX 30/04/2026 (audit globale): verifica access PRIMA di toccare
    // pricing_grid. Senza questa verifica, un utente loggato di Hotel A
    // poteva sovrascrivere prezzi di Hotel B (e triggerare l'autopilot
    // che pusha al PMS dell'altro hotel). Critico.
    const deniedPost = await validateHotelAccess(hotel_id)
    if (deniedPost) return deniedPost

    // Validate source
    const validSources = ["manual_grid", "drag_fill", "bulk_fill", "publish_suggested", "autopilot_push", "autopilot_calculated", "algorithm"]
    const finalSource = validSources.includes(source) ? source : "manual_grid"

    // If changed_by not provided, try to extract from authenticated user
    if (!changed_by) {
      try {
        const { isDevAuthAsync } = await import("@/lib/env/dev-auth")
        const isV0Preview = await isDevAuthAsync()
        if (isV0Preview) {
          changed_by = "5de43b7b-e661-4e4e-8177-7943df06470c"
        } else {
          const { getAuthUser } = await import("@/lib/supabase/server")
          const supabase = await createClient()
          const user = await getAuthUser(supabase)
          if (user?.id) {
            changed_by = user.id
          }
        }
      } catch (e) {
        console.error("[pricing-grid] Failed to extract user ID:", e)
        // Continue anyway - changed_by can be NULL
      }
    }

    const supabase = await createClient()

    // Fetch rate_limits to enforce [bottom_rate, rack_rate] clamp
    const { data: rateLimitsData } = await supabase
      .from("rate_limits")
      .select("room_type_id, bottom_rate, rack_rate")
      .eq("hotel_id", hotel_id)

    const rateLimitsMap = new Map<string, { bottom: number; rack: number }>()
    for (const rl of rateLimitsData || []) {
      rateLimitsMap.set(rl.room_type_id, {
        bottom: rl.bottom_rate || 0,
        rack: rl.rack_rate || 0,
      })
    }

    // CLAMP: Enforce [bottom_rate, rack_rate] on all entries BEFORE sending to RPC
    const warnings: string[] = []
    const clampedEntries = entries.map((entry) => {
      const limits = rateLimitsMap.get(entry.room_type_id)
      if (!limits) return entry
      let price = entry.price
      if (limits.bottom > 0 && price < limits.bottom) {
        warnings.push(`${entry.date} occ ${entry.occupancy}: ${price} -> ${limits.bottom} (bottom_rate)`)
        price = limits.bottom
      }
      if (limits.rack > 0 && price > limits.rack) {
        warnings.push(`${entry.date} occ ${entry.occupancy}: ${price} -> ${limits.rack} (rack_rate)`)
        price = limits.rack
      }
      return price !== entry.price ? { ...entry, price } : entry
    })

    // ATOMIC RPC CALL: all database operations happen in a single transaction
    // If any step fails, the entire transaction rolls back (no partial writes)
    console.log("[v0] [pricing-grid POST] Calling upsert_prices_atomic RPC...")
    console.log("[v0] [pricing-grid POST] First entry sample:", JSON.stringify(clampedEntries[0]))
    const { data, error } = await supabase.rpc("upsert_prices_atomic", {
      p_hotel_id: hotel_id,
      p_entries: clampedEntries, // Pass clamped entries
      p_source: finalSource,
      p_changed_by: changed_by,
    })

    console.log("[v0] [pricing-grid POST] RPC COMPLETE - data:", JSON.stringify(data), "error:", error?.message || "none")

    if (error) {
      console.error("[pricing-grid] Atomic upsert RPC error:", error)
      return NextResponse.json(
        { error: `Atomic upsert failed: ${error.message}` },
        { status: 500 }
      )
    }

    // data contains: { success, upserted_count, logged_count, source, changed_by }
    const loggedCount = data?.logged_count || 0

    // FIX 1 (29/04/2026): trigger autopilot push for manual edits made from
    // the pricing grid UI. Without this, when the user saves a cell and
    // autopilot=on, the new price is stored in pricing_grid but is never
    // delivered to the PMS until the user clicks "Invia al PMS" manually.
    //
    // Fire-and-forget: a push failure must NOT make the save fail. Errors
    // from the push are tracked separately via retry_count / next_retry_at
    // on price_change_log and surfaced by the daily superadmin email.
    //
    // Skipped sources: autopilot_push and autopilot_calculated already come
    // from the autopilot pipeline itself, re-triggering would cause loops.
    const SKIP_AUTOPILOT_TRIGGER = new Set([
      "autopilot_push",
      "autopilot_calculated",
    ])
    if (loggedCount > 0 && !SKIP_AUTOPILOT_TRIGGER.has(finalSource)) {
      // We need an array of sources for executeAutopilotAction's IN(...)
      // filter; for manual edits, only the current source is in scope.
      ;(async () => {
        try {
          const { executeAutopilotAction } = await import("@/lib/pricing/auto-trigger")
          const result = await executeAutopilotAction(hotel_id, loggedCount, [finalSource])
          console.log(
            "[v0] [pricing-grid POST] autopilot trigger:",
            JSON.stringify(result),
          )
        } catch (err) {
          // Best-effort: never block the save response. The retry sweep
          // will pick up any rows still at action_taken='none' next cron.
          console.error(
            "[v0] [pricing-grid POST] autopilot trigger error (non-blocking):",
            err instanceof Error ? err.message : err,
          )
        }
      })()
    }

    return NextResponse.json({
      success: true,
      count: data?.upserted_count || 0,
      historyCount: loggedCount,
      source: data?.source || finalSource,
      changed_by: data?.changed_by || null,
      warnings: warnings.length > 0 ? warnings : undefined, // Include warnings if any
    })
  } catch (error) {
    console.error("[pricing-grid] POST error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    )
  }
}
