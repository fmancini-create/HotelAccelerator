import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { hasAddon } from "@/lib/addons/has-addon"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const median = (arr: number[]): number | null => {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// GET: confronto prezzi nostri vs comp set per ogni notte del range.
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("warm") === "1") {
    return NextResponse.json({ ok: true, warm: true })
  }
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotelId")
    if (!hotelId) return NextResponse.json({ error: "hotelId richiesto" }, { status: 400 })
    const occupancy = Number(sp.get("occupancy") || 2)

    const denied = await validateHotelAccess(hotelId, null, { allowSeller: "full" })
    if (denied) return denied
    if (!(await hasAddon(hotelId, "rate_shopper"))) {
      return NextResponse.json({ error: "Addon non attivo", code: "ADDON_REQUIRED" }, { status: 403 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const from = sp.get("from") || today
    const toDefault = new Date()
    toDefault.setDate(toDefault.getDate() + 30)
    const to = sp.get("to") || toDefault.toISOString().slice(0, 10)

    const supabase = await createServiceRoleClient()

    // 1) Comp set attivo
    const { data: competitors } = await supabase
      .from("competitors")
      .select("id, name")
      .eq("hotel_id", hotelId)
      .eq("active", true)
      .order("created_at", { ascending: true })
    const compName = new Map((competitors ?? []).map((c) => [c.id, c.name]))

    // 2) Il NOSTRO prezzo per notte = prezzo piu' basso in pricing_grid per
    //    l'occupanza richiesta (anchor "a partire da"). Paginato (giorni ×
    //    tipologie × tariffe puo' superare 1000).
    const ourRows = await fetchAllPaginatedOrLog<{ date: string; price: number }>(
      () =>
        supabase
          .from("pricing_grid")
          .select("date, price")
          .eq("hotel_id", hotelId)
          .eq("occupancy", occupancy)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true }),
      "rate-shopper-our-prices",
    )
    const ourPrice = new Map<string, number>()
    for (const r of ourRows) {
      if (r.price == null) continue
      const p = Number(r.price)
      const cur = ourPrice.get(r.date)
      if (cur == null || p < cur) ourPrice.set(r.date, p)
    }

    // 2b) Nostra disponibilita' per notte: somma su tutte le tipologie. Una data
    //     e' SOLD OUT quando esistono righe ma il totale vendibile e' 0 (struttura
    //     piena). Calcoliamo anche l'occupazione = (vendibili - disponibili) /
    //     vendibili, con vendibili = total_rooms - rooms_out_of_service.
    const availRows = await fetchAllPaginatedOrLog<{
      date: string
      total_rooms: number | null
      rooms_out_of_service: number | null
      rooms_available: number | null
    }>(
      () =>
        supabase
          .from("daily_availability")
          .select("date, total_rooms, rooms_out_of_service, rooms_available")
          .eq("hotel_id", hotelId)
          .gte("date", from)
          .lte("date", to)
          .order("date", { ascending: true }),
      "rate-shopper-our-availability",
    )
    // per data: camere vendibili totali e camere disponibili residue
    const sellableByDate = new Map<string, number>()
    const availByDate = new Map<string, number>()
    for (const r of availRows) {
      const sellable = Math.max(0, Number(r.total_rooms ?? 0) - Number(r.rooms_out_of_service ?? 0))
      const free = Math.max(0, Number(r.rooms_available ?? 0))
      sellableByDate.set(r.date, (sellableByDate.get(r.date) ?? 0) + sellable)
      availByDate.set(r.date, (availByDate.get(r.date) ?? 0) + free)
    }
    // occupazione % per data (0-100), null se non abbiamo vendibili note
    const occByDate = new Map<string, number>()
    for (const [date, sellable] of sellableByDate) {
      if (sellable <= 0) continue
      const free = availByDate.get(date) ?? 0
      occByDate.set(date, Math.round(((sellable - free) / sellable) * 100))
    }

    // 3) Prezzi competitor nel range (serie storica) -> tieni l'ultima cattura
    //    per (competitor, stay_date).
    const rateRows = await fetchAllPaginatedOrLog<{
      competitor_id: string
      stay_date: string
      captured_at: string
      price: number | null
      availability: boolean | null
    }>(
      () =>
        supabase
          .from("competitor_rates")
          .select("competitor_id, stay_date, captured_at, price, availability")
          .eq("hotel_id", hotelId)
          .eq("occupancy", occupancy)
          .gte("stay_date", from)
          .lte("stay_date", to)
          .order("stay_date", { ascending: true })
          .order("captured_at", { ascending: true }),
      "rate-shopper-comp-rates",
    )

    // latest per (competitor, stay_date)
    const latest = new Map<string, { price: number | null; availability: boolean | null; capturedAt: string }>()
    for (const r of rateRows) {
      const key = `${r.competitor_id}|${r.stay_date}`
      const prev = latest.get(key)
      if (!prev || r.captured_at > prev.capturedAt) {
        latest.set(key, { price: r.price == null ? null : Number(r.price), availability: r.availability, capturedAt: r.captured_at })
      }
    }

    // 4) Costruisci la tabella per data
    const dates = new Set<string>([...ourPrice.keys()])
    for (const key of latest.keys()) dates.add(key.split("|")[1])
    for (const d of availByDate.keys()) dates.add(d)

    const days = [...dates]
      .filter((d) => d >= from && d <= to)
      .sort()
      .map((date) => {
        const comps = (competitors ?? []).map((c) => {
          const cell = latest.get(`${c.id}|${date}`)
          return {
            competitorId: c.id,
            name: c.name,
            price: cell?.price ?? null,
            availability: cell?.availability ?? null,
          }
        })
        const prices = comps.map((c) => c.price).filter((p): p is number => p != null && p > 0)
        const our = ourPrice.get(date) ?? null
        // sold out: abbiamo dati di disponibilita' per la data e il vendibile e' 0
        const ourSoldOut = availByDate.has(date) && (availByDate.get(date) ?? 0) <= 0
        const min = prices.length ? Math.min(...prices) : null
        const max = prices.length ? Math.max(...prices) : null
        const med = median(prices)
        // posizionamento: quanti competitor costano meno di noi
        let rank: number | null = null
        if (our != null && prices.length) {
          rank = prices.filter((p) => p < our).length + 1 // 1 = piu' economico
        }
        return {
          date,
          ourPrice: our,
          ourSoldOut,
          ourOccupancy: occByDate.get(date) ?? null,
          competitors: comps,
          market: { min, median: med, max, count: prices.length },
          diffVsMedianPct: our != null && med != null && med > 0 ? ((our - med) / med) * 100 : null,
          rank,
          rankOf: prices.length + (our != null ? 1 : 0),
        }
      })

    // 5) Riepilogo
    const withMarket = days.filter((d) => d.ourPrice != null && d.market.median != null)
    const avgDiff =
      withMarket.length > 0
        ? withMarket.reduce((s, d) => s + (d.diffVsMedianPct ?? 0), 0) / withMarket.length
        : null
    const cheaper = withMarket.filter((d) => (d.diffVsMedianPct ?? 0) < 0).length
    const pricier = withMarket.filter((d) => (d.diffVsMedianPct ?? 0) > 0).length

    return NextResponse.json({
      range: { from, to, occupancy },
      competitors: (competitors ?? []).map((c) => ({ id: c.id, name: compName.get(c.id) })),
      days,
      summary: {
        daysCompared: withMarket.length,
        avgDiffVsMedianPct: avgDiff,
        daysCheaper: cheaper,
        daysPricier: pricier,
      },
    })
  } catch (error) {
    console.error("[rate-shopper] error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
