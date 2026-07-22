/**
 * IMPORT HOLIDAYS API
 * POST /api/accelerator/events/import-holidays
 *
 * Due modalita':
 * 1) Mercati storici (default): { hotel_id, year }
 *    - se country_codes non e' passato, rileva le top 5 nazionalita' dalle
 *      prenotazioni (mercati storici) e importa le loro festivita' per l'anno.
 * 2) Mercati potenziali (per Nazione + range): { hotel_id, country_codes, from, to }
 *    - importa le festivita' delle nazioni scelte nell'intervallo di date
 *      indicato (puo' coprire piu' anni), utile per costruirsi mercati nuovi.
 *
 * Usa date.nager.at (free, no auth) per le festivita' pubbliche.
 */
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Impact colors by country for visual variety
const COUNTRY_COLORS: Record<string, string> = {
  IT: "#ef4444", DE: "#f59e0b", FR: "#3b82f6", GB: "#8b5cf6",
  US: "#06b6d4", AT: "#ec4899", CH: "#10b981", NL: "#f97316",
  ES: "#a855f7", BE: "#84cc16", PL: "#06b6d4", RU: "#64748b",
  CN: "#ef4444", JP: "#f43f5e", BR: "#22c55e",
}

function colorForCountry(code: string): string {
  return COUNTRY_COLORS[code.toUpperCase()] ?? "#f59e0b"
}

// Tutti gli anni (interi) coperti da un intervallo di date YYYY-MM-DD, cap a 5
// anni per evitare un numero eccessivo di chiamate verso date.nager.at.
function rangeYears(from: string, to: string): number[] {
  const y1 = Number(from.slice(0, 4))
  const y2 = Number(to.slice(0, 4))
  if (!y1 || !y2 || y2 < y1) return [y1 || new Date().getFullYear()]
  const out: number[] = []
  for (let y = y1; y <= Math.min(y2, y1 + 4); y++) out.push(y)
  return out
}

async function fetchHolidays(countryCode: string, year: number): Promise<any[]> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode.toUpperCase()}`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data
}

async function detectTopCountries(supabase: any, hotelId: string, limit = 5): Promise<string[]> {
  // Try scidoo_raw_bookings first
  const { data: bookings } = await supabase
    .from("scidoo_raw_bookings")
    .select("customer_nationality")
    .eq("hotel_id", hotelId)
    .not("customer_nationality", "is", null)
    .limit(2000)

  if (bookings && bookings.length > 0) {
    const counts: Record<string, number> = {}
    for (const b of bookings) {
      const nat = (b.customer_nationality || "").toUpperCase().trim()
      if (nat && nat.length === 2) {
        counts[nat] = (counts[nat] || 0) + 1
      }
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([code]) => code)
    if (sorted.length > 0) return sorted
  }

  // Fallback: detect from hotel country + common European markets
  const { data: hotel } = await supabase
    .from("hotels")
    .select("country_code")
    .eq("id", hotelId)
    .single()

  const hotelCountry = hotel?.country_code?.toUpperCase() ?? "IT"
  const defaults = ["DE", "FR", "GB", "US", "AT"].filter(c => c !== hotelCountry)
  return [hotelCountry, ...defaults].slice(0, limit)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { hotel_id, year, country_codes, from, to } = body

  if (!hotel_id) {
    return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
  }

  // Range mode (mercati potenziali) richiede from+to e almeno una nazione.
  const isRangeMode = Boolean(from && to)
  if (!isRangeMode && !year) {
    return NextResponse.json({ error: "year required (or pass from/to for range mode)" }, { status: 400 })
  }
  if (isRangeMode && !(Array.isArray(country_codes) && country_codes.length > 0)) {
    return NextResponse.json({ error: "country_codes required in range mode" }, { status: 400 })
  }

  const supabase = await createClient()

  // Determine which countries to import.
  // - Range mode: nazioni scelte esplicitamente (mercati potenziali).
  // - Default: nazioni passate oppure rilevate dai mercati storici.
  const countries: string[] = Array.isArray(country_codes) && country_codes.length > 0
    ? country_codes.map((c: string) => c.toUpperCase())
    : await detectTopCountries(supabase, hotel_id)

  // Anni da interrogare: in range mode copriamo tutti gli anni tra from e to.
  const years: number[] = isRangeMode
    ? rangeYears(from, to)
    : [Number(year)]

  console.log(
    `[v0] import-holidays: hotel=${hotel_id} mode=${isRangeMode ? "range" : "year"} ` +
    `years=${years.join(",")} countries=${countries.join(",")}` +
    (isRangeMode ? ` from=${from} to=${to}` : ""),
  )

  const allEvents: any[] = []
  const failed: string[] = []

  await Promise.all(
    countries.map(async (code) => {
      try {
        for (const y of years) {
          const holidays = await fetchHolidays(code, y)
          for (const h of holidays) {
            // In range mode, scarta le festivita' fuori dall'intervallo.
            if (isRangeMode && (h.date < from || h.date > to)) continue
            allEvents.push({
              hotel_id,
              date: h.date,
              name: `${h.localName}${h.localName !== h.name ? ` (${h.name})` : ""}`,
              type: "holiday",
              country_code: code.toUpperCase(),
              impact: "high",
              color: colorForCountry(code),
              notes: h.types?.join(", ") || null,
            })
          }
        }
      } catch {
        failed.push(code)
      }
    })
  )

  if (allEvents.length === 0) {
    return NextResponse.json({ error: "No holidays found", countries, failed }, { status: 400 })
  }

  // Batch upsert - ignore duplicates via unique index
  let errors = 0
  for (let i = 0; i < allEvents.length; i += 200) {
    const batch = allEvents.slice(i, i + 200)
    const { error } = await supabase
      .from("hotel_events")
      .upsert(batch, { onConflict: "hotel_id,date,country_code,name,type", ignoreDuplicates: true })
    if (error) {
      console.error("[v0] import-holidays upsert error:", error.message)
      errors++
    }
  }

  console.log(`[v0] import-holidays: inserted ${allEvents.length} events for countries ${countries.join(",")} errors=${errors}`)

  return NextResponse.json({
    ok: true,
    mode: isRangeMode ? "range" : "year",
    countries,
    years,
    from: isRangeMode ? from : null,
    to: isRangeMode ? to : null,
    inserted: allEvents.length, // total prepared (duplicates are silently skipped by DB)
    failed,
  })
}
