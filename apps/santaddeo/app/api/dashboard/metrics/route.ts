import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { NextRequest, NextResponse } from "next/server"
import { measureRoute } from "@/lib/performance/with-perf"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { cachedQuery, cacheKey, CacheTTL } from "@/lib/cache/redis"
import { getDashboardMetrics, getDateSelectorData } from "@/lib/services/metrics.service"
import { parseVatViewParam } from "@/lib/utils/vat-display"

// ⚠️ SECURITY:
// Questa route si affida a RLS di Supabase.
// NON usare service_role.
// NON aggiungere query su tabelle senza RLS.
export const dynamic = "force-dynamic"

async function _GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // Keep-warm short-circuit (cron /api/cron/keep-warm).
  // Quando la lambda viene invocata con ?warm=1 esce SUBITO, prima di auth e DB:
  // il cold start (boot del processo + import dei moduli) viene cosi' pagato dal
  // cron e la successiva richiesta utente trova la lambda calda. Nessun accesso
  // a dati, nessun side effect. Aggiunta 23/06/2026: e' la route piu' usata
  // (metà del traffico) e a 722ms era gonfiata dai cold start (70%).
  if (searchParams.get("warm") === "1") {
    return NextResponse.json({ warm: true, at: new Date().toISOString() })
  }

  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const hotelId = searchParams.get("hotel_id")
  const period = searchParams.get("period") || "day"
  const type = searchParams.get("type") // "comparison" | "date-selector" | null (default)
  const customFrom = searchParams.get("from")
  const customTo = searchParams.get("to")
  const previousFromParam = searchParams.get("previousFrom")
  const previousToParam = searchParams.get("previousTo")
  const dateParam = searchParams.get("date") // for date-selector type
  const vatView = parseVatViewParam(searchParams) // override vista netto/lordo (null = default tenant)

  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  // Validate user has access to this hotel.
  // PERF 03/05/2026: passiamo l'user gia' ottenuto da getAuthUserOrDev per
  // evitare un secondo `auth.getUser()` round-trip a Supabase Auth.
  const denied = await validateHotelAccess(hotelId, user, { allowSeller: "metrics" })
  if (denied) return denied

  // FIX 01/05/2026 (RevPAR sbagliato a cavallo della mezzanotte Rome time):
  // Il server Vercel gira in UTC. `new Date()` di notte (00:00-02:00 ora Rome
  // = 22:00-00:00 UTC del giorno prima) restituiva ieri, e il calcolo del mese
  // ritornava il mese precedente. Sintomo: utente Barronci alle 00:40 del
  // 1 maggio vedeva il KPI "Mese" con dati di aprile (711 / 720) e si
  // chiedeva perche' il RevPAR fosse 180 invece di ~174 (31 giorni × 24
  // camere = 744 di maggio). Tutte le date qui sotto vengono ora calcolate
  // in fuso `Europe/Rome` per essere coerenti con la percezione dell'utente.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const todayRomeIso = fmt.format(new Date()) // YYYY-MM-DD in Rome time
  const [todayY, todayM, todayD] = todayRomeIso.split("-").map((s) => parseInt(s, 10))
  let startDate: string
  let endDate: string

  // Handle date-selector type: fetch bookings/cancellations by booking_date
  if (type === "date-selector" && dateParam) {
    try {
      const result = await getDateSelectorData(supabase, hotelId, dateParam)
      return NextResponse.json(result)
    } catch (error: any) {
      console.error("Date selector API error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Handle custom date range (for comparison type)
  if (customFrom && customTo) {
    startDate = customFrom
    endDate = customTo
  } else if (period === "day") {
    startDate = todayRomeIso
    endDate = todayRomeIso
  } else if (period === "month") {
    // Mese in corso (Rome time): dal 1 del mese all'ultimo giorno del mese.
    // FIX 01/05/2026 (denominatore RevPAR sbagliato per il mese in corso):
    // Prima `endDate = today` faceva sì che, in qualunque giorno del mese
    // diverso dall'ultimo, il denominatore "camere disponibili" fosse troppo
    // piccolo (RevPAR sovrastimato). L'utente si aspetta che il KPI "Mese"
    // mostri il dato dell'INTERO mese (744 = 31×24 per maggio), non il MTD.
    const lastDayOfMonth = new Date(Date.UTC(todayY, todayM, 0)).getUTCDate()
    const mm = String(todayM).padStart(2, "0")
    startDate = `${todayY}-${mm}-01`
    endDate = `${todayY}-${mm}-${String(lastDayOfMonth).padStart(2, "0")}`
  } else {
    // Year: from Jan 1 to Dec 31 of the current year (Rome time).
    startDate = `${todayY}-01-01`
    endDate = `${todayY}-12-31`
  }
  
  // For comparison type, handle previousFrom/previousTo params
  const previousStartDate = previousFromParam || null
  const previousEndDate = previousToParam || null
  
  try {
    // Build cache key from all query parameters
    // vatView fa parte della cache key: lordo e netto sono payload diversi.
    const ck = cacheKey("metrics", hotelId, period, startDate, endDate, type || "default", customFrom || "", customTo || "", vatView || "tenant")

    const result = await cachedQuery(ck, CacheTTL.METRICS, async () => {
      return getDashboardMetrics(supabase, hotelId, period, startDate, endDate, vatView)
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Metrics API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export const GET = measureRoute("/api/dashboard/metrics", _GET)
