// Verifica disponibilita' Cavallino: confronta 4 fonti per date note dal PDF Bedzzle.
//   1) occupancy derivata da connectors.brig_raw_bookings (cio' che usa l'ETL)
//   2) occupancy derivata da public.bookings (piu' completa secondo memoria)
//   3) occupancy memorizzata in daily_availability (cio' che vede l'app)
//   4) ground truth dal PDF Bedzzle RMS Dashboard
import { createClient } from "@supabase/supabase-js"

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://aeynirkfixurikshxfov.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const HOTEL = "bb880163-3973-451b-89a0-6c965b07712b" // Hotel Cavallino

// PDF Bedzzle (inventory 80) -> occupate reali
const PDF = {
  "2026-06-04": 65,
  "2026-06-05": 40,
  "2026-06-06": 26,
  "2026-06-07": 17,
  "2026-06-10": 15,
  "2026-06-13": 42,
  "2026-06-20": 12,
  "2026-06-30": 16,
}
const DATES = Object.keys(PDF).sort()

const pub = createClient(url, key, { auth: { persistSession: false } })
const conn = createClient(url, key, { auth: { persistSession: false }, db: { schema: "connectors" } })

async function fetchAll(qb) {
  const all = []
  let from = 0
  const PAGE = 1000
  for (;;) {
    const { data, error } = await qb.range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all.push(...(data || []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

function dateOnly(v) {
  if (typeof v !== "string" || !v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const i = v.indexOf("T")
  if (i === 10) return v.slice(0, 10)
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function countCovering(rows, date, getIn, getOut, getRooms) {
  let n = 0
  for (const r of rows) {
    const ci = dateOnly(getIn(r))
    const co = dateOnly(getOut(r))
    if (!ci || !co) continue
    if (ci <= date && date < co) n += getRooms ? getRooms(r) : 1
  }
  return n
}

async function main() {
  // 1) raw bookings (non-deleted)
  const raw = await fetchAll(
    conn
      .from("brig_raw_bookings")
      .select("checkin, checkout, status_code, room_code, raw_data")
      .eq("hotel_id", HOTEL),
  )
  const rawActive = raw.filter((r) => {
    const st = r?.raw_data?.status
    return st !== "DELETED" && r.status_code !== 4
  })
  console.log(`raw_bookings: ${raw.length} totali, ${rawActive.length} attive (non DELETED)`)

  // 2) public bookings (non-cancelled room bookings)
  const bk = await fetchAll(
    pub
      .from("bookings")
      .select("check_in_date, check_out_date, is_cancelled, cancellation_date, number_of_rooms, is_room_booking")
      .eq("hotel_id", HOTEL),
  )
  const bkActive = bk.filter((b) => {
    if (b.is_room_booking === false) return false
    if (b.is_cancelled) return false
    return true
  })
  console.log(`public.bookings: ${bk.length} totali, ${bkActive.length} attive (room, non-cancellate)`)

  // 3) daily_availability stored
  const avail = await fetchAll(
    pub
      .from("daily_availability")
      .select("date, total_rooms, rooms_available, rooms_out_of_service")
      .eq("hotel_id", HOTEL)
      .in("date", DATES),
  )
  const storedByDate = {}
  for (const a of avail) {
    const d = dateOnly(a.date)
    if (!storedByDate[d]) storedByDate[d] = { total: 0, occ: 0 }
    const occ = (a.total_rooms || 0) - (a.rooms_available || 0) - (a.rooms_out_of_service || 0)
    storedByDate[d].total += a.total_rooms || 0
    storedByDate[d].occ += occ
  }

  console.log("\nDATE        PDF  raw  bookings  stored(occ/tot)")
  for (const d of DATES) {
    const rawOcc = countCovering(rawActive, d, (r) => r.checkin, (r) => r.checkout)
    const bkOcc = countCovering(
      bkActive,
      d,
      (b) => b.check_in_date,
      (b) => b.check_out_date,
      (b) => b.number_of_rooms || 1,
    )
    const st = storedByDate[d] || { total: 0, occ: 0 }
    console.log(
      `${d}  ${String(PDF[d]).padStart(3)}  ${String(rawOcc).padStart(3)}  ${String(bkOcc).padStart(8)}  ${st.occ}/${st.total}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
