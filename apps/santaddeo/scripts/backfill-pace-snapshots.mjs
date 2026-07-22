// Backfill iniziale di pace_snapshots: per ogni hotel attivo cattura
// snapshot a ritroso (oggi, -7, -14, ... fino a -84 giorni) ricostruendo
// l'OTB da booking_date. Da' subito una curva di pace storica nella tabella
// canonica; da domani il cron pace-snapshot aggiunge lo snapshot giornaliero.
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const HORIZON_DAYS = 365
const BACKFILL_WEEKS = 12

const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (s, n) => {
  const d = new Date(s + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

// Replica di fetchPaceBookings + computeOtb (versione standalone per lo script).
async function fetchBookings(hotelId, nightFrom, nightToExcl) {
  const all = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sb
      .from("bookings")
      .select(
        "booking_date, check_in_date, check_out_date, is_cancelled, cancellation_date, number_of_rooms, number_of_nights, total_price, net_price, extras_revenue",
      )
      .eq("hotel_id", hotelId)
      .lt("check_in_date", nightToExcl)
      .gt("check_out_date", nightFrom)
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return all
}

function computeOtbByNight(bookings, asOf, nightFrom, nightToExcl) {
  const map = new Map()
  for (const b of bookings) {
    if (b.booking_date && b.booking_date > asOf) continue // non ancora prenotata a quella data
    // cancellata "as-of": non on-the-books se gia' cancellata entro asOf.
    if (b.is_cancelled) {
      if (!b.cancellation_date || b.cancellation_date <= asOf) continue
    }
    const ci = b.check_in_date
    const co = b.check_out_date
    if (!ci || !co) continue
    const nights =
      Number(b.number_of_nights) > 0
        ? Number(b.number_of_nights)
        : Math.max(1, Math.round((new Date(co) - new Date(ci)) / 86400000))
    const roomQty = Number(b.number_of_rooms) > 0 ? Number(b.number_of_rooms) : 1
    const roomTotal = b.net_price != null ? Number(b.net_price) : Number(b.total_price || 0) - Number(b.extras_revenue || 0)
    const perNight = roomTotal / nights
    for (let n = 0; n < nights; n++) {
      const night = addDays(ci, n)
      if (night < nightFrom || night >= nightToExcl) continue
      const cur = map.get(night) || { rooms: 0, revenue: 0 }
      cur.rooms += roomQty
      cur.revenue += perNight
      map.set(night, cur)
    }
  }
  return map
}

const { data: hotels, error } = await sb.from("hotels").select("id, name").eq("is_active", true)
if (error) {
  console.error("fetch hotels:", error.message)
  process.exit(1)
}

const today = iso(new Date())
const horizonEnd = addDays(today, HORIZON_DAYS)
let grandTotal = 0

for (const hotel of hotels ?? []) {
  // un solo fetch copre tutte le notti dell'orizzonte; ricalcoliamo l'OTB a
  // diverse date asOf retroattive (lo storico booking_date e' immutabile).
  const bookings = await fetchBookings(hotel.id, today, addDays(horizonEnd, 1))
  let hotelRows = 0
  for (let w = 0; w <= BACKFILL_WEEKS; w++) {
    const snapshotDate = addDays(today, -w * 7)
    const otb = computeOtbByNight(bookings, snapshotDate, snapshotDate, addDays(horizonEnd, 1))
    if (otb.size === 0) continue
    const rows = [...otb.entries()].map(([stay_date, c]) => ({
      hotel_id: hotel.id,
      snapshot_date: snapshotDate,
      stay_date,
      rooms_otb: c.rooms,
      revenue_otb: Math.round(c.revenue * 100) / 100,
      source: "reconstructed",
    }))
    // upsert a blocchi di 1000
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000)
      const { error: upErr } = await sb
        .from("pace_snapshots")
        .upsert(chunk, { onConflict: "hotel_id,snapshot_date,stay_date" })
      if (upErr) {
        console.error(`  ${hotel.name} ${snapshotDate}: upsert error ${upErr.message}`)
        break
      }
      hotelRows += chunk.length
    }
  }
  grandTotal += hotelRows
  console.log(`${hotel.name}: ${hotelRows} righe`)
}
console.log(`Totale backfill: ${grandTotal} righe in pace_snapshots`)
