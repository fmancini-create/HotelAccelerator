// One-off: report disponibilita' Cavallino giugno 2026 da girare a BRiG/Bedzzle.
// Mapping status BRiG (lib/connectors/brig/types.ts): CONFIRMED=0, NO_SHOW=2,
// CANCELLED=4 (== "DELETED"), OPTIONAL=9.
// Occupazione notte N = righe con checkin <= N < checkout (filtro fatto in JS
// per evitare ambiguita' di fuso orario). 1 riga = 1 camera.
import { createClient } from "@supabase/supabase-js"

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://aeynirkfixurikshxfov.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const pub = createClient(url, key, { auth: { persistSession: false } })
const conn = createClient(url, key, { auth: { persistSession: false }, db: { schema: "connectors" } })

const HOTEL = "bb880163-3973-451b-89a0-6c965b07712b" // Hotel Cavallino
const YM = "2026-06"

// "TOTAL OCCUPANCY" dalla tab Bedzzle Dashboard-data (screenshot 25/06).
const BEDZZLE = {
  "2026-06-02": 30, "2026-06-03": 71, "2026-06-04": 66, "2026-06-05": 46,
  "2026-06-06": 37, "2026-06-07": 29, "2026-06-08": 43, "2026-06-09": 47,
  "2026-06-10": 52, "2026-06-11": 43, "2026-06-12": 34, "2026-06-13": 79,
  "2026-06-14": 17, "2026-06-15": 43, "2026-06-16": 61, "2026-06-17": 64,
  "2026-06-18": 47, "2026-06-19": 18, "2026-06-20": 25, "2026-06-21": 18,
  "2026-06-22": 53, "2026-06-23": 58, "2026-06-24": 67, "2026-06-25": 55,
  "2026-06-26": 24, "2026-06-27": 19, "2026-06-28": 13, "2026-06-29": 12,
  "2026-06-30": 16,
}

const CANCELLED = 4
const OPTIONAL = 9

async function main() {
  // daily_availability (cio' che mostra la pagina), sommata su tutte le tipologie
  const { data: avail, error: ae } = await pub
    .from("daily_availability")
    .select("date,total_rooms,rooms_out_of_service,rooms_available")
    .eq("hotel_id", HOTEL).gte("date", `${YM}-01`).lte("date", `${YM}-30`)
  if (ae) throw ae
  const pageByDate = new Map()
  for (const r of avail ?? []) {
    const sold = (r.total_rooms ?? 0) - (r.rooms_out_of_service ?? 0) - (r.rooms_available ?? 0)
    pageByDate.set(r.date, (pageByDate.get(r.date) ?? 0) + sold)
  }

  // tutte le prenotazioni BRiG che intersecano giugno
  const { data: bks, error: be } = await conn
    .from("brig_raw_bookings")
    .select("checkin,checkout,status_code")
    .eq("hotel_id", HOTEL)
    .lt("checkin", `${YM}-30T23:59:59`)
    .gte("checkout", `${YM}-01`)
  if (be) throw be

  const rows = []
  for (let d = 1; d <= 30; d++) {
    const date = `${YM}-${String(d).padStart(2, "0")}`
    let confirmed = 0
    let cancelled = 0
    for (const b of bks ?? []) {
      const ci = String(b.checkin).slice(0, 10)
      const co = String(b.checkout).slice(0, 10)
      if (ci > date || co <= date) continue // notte coperta: checkin <= date < checkout
      const c = b.status_code
      if (c === CANCELLED) cancelled++
      else if (c === OPTIONAL) continue // opzioni non occupano
      else confirmed++ // CONFIRMED(0) e NO_SHOW(2)
    }
    rows.push({ date, confirmed, cancelled, page: pageByDate.get(date) ?? null, bedzzle: BEDZZLE[date] ?? null })
  }

  console.log("DATA       | BRiG confermate | BRiG cancellate | Santaddeo | Bedzzle | gap(Bed-conf)")
  for (const r of rows) {
    const gap = r.bedzzle != null ? r.bedzzle - r.confirmed : null
    console.log(
      `${r.date} | ${String(r.confirmed).padStart(15)} | ${String(r.cancelled).padStart(15)} | ${String(r.page ?? "n/d").padStart(9)} | ${String(r.bedzzle ?? "n/d").padStart(7)} | ${gap != null ? String(gap).padStart(12) : "n/d"}`,
    )
  }
  const t = rows.reduce((a, r) => ({ c: a.c + r.confirmed, p: a.p + (r.page ?? 0), b: a.b + (r.bedzzle ?? 0) }), { c: 0, p: 0, b: 0 })
  console.log(`\nTotali giugno -> BRiG confermate=${t.c}  Santaddeo=${t.p}  Bedzzle=${t.b}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
