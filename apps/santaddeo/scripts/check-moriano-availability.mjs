// Diagnostico Moriano: report disponibilita' settembre-dicembre 2026.
// daily_availability ha schema (total_rooms, rooms_out_of_service,
// rooms_available); occupied si deriva: total - oos - avail.
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const { data: hotels } = await sb.from("hotels").select("id, name").ilike("name", "%moriano%")
const hotel = hotels[0]
console.log(`Hotel: ${hotel.name} (${hotel.id})`)

const { data: roomTypes } = await sb
  .from("room_types")
  .select("id, name, total_rooms, is_active")
  .eq("hotel_id", hotel.id)
  .order("name")

console.log(`\nRoom types in DB:`)
for (const rt of roomTypes || []) {
  console.log(`  - ${rt.name}: total_rooms=${rt.total_rooms}  active=${rt.is_active}  id=${rt.id}`)
}
const activeTotal = (roomTypes || []).filter(r => r.is_active).reduce((s, r) => s + (r.total_rooms || 0), 0)
console.log(`Totale camere ATTIVE: ${activeTotal}`)
const allTotal = (roomTypes || []).reduce((s, r) => s + (r.total_rooms || 0), 0)
console.log(`Totale camere TUTTE (incl. inattive): ${allTotal}`)

const dateFrom = "2026-09-01"
const dateTo = "2026-12-31"
const { data: avail } = await sb
  .from("daily_availability")
  .select("date, room_type_id, total_rooms, rooms_available, rooms_out_of_service, source, updated_at")
  .eq("hotel_id", hotel.id)
  .gte("date", dateFrom)
  .lte("date", dateTo)
  .order("date")

console.log(`\nRighe daily_availability ${dateFrom} -> ${dateTo}: ${(avail || []).length}`)

// Source breakdown
const sourceCount = {}
for (const r of avail || []) sourceCount[r.source || "null"] = (sourceCount[r.source || "null"] || 0) + 1
console.log("Per source:", sourceCount)

// Per room type su intero range
const rtMap = new Map((roomTypes || []).map(rt => [rt.id, rt]))
const perRT = new Map()
for (const r of avail || []) {
  const k = r.room_type_id
  if (!perRT.has(k)) perRT.set(k, { dates: new Set(), totRooms: new Set(), totalAvail: 0, totalOOS: 0, occupiedDays: 0, sources: new Set() })
  const x = perRT.get(k)
  x.dates.add(r.date)
  x.totRooms.add(r.total_rooms)
  x.totalAvail += (r.rooms_available || 0)
  x.totalOOS += (r.rooms_out_of_service || 0)
  x.occupiedDays += (r.total_rooms - (r.rooms_out_of_service || 0) - (r.rooms_available || 0))
  x.sources.add(r.source || "null")
}

console.log(`\nPer room_type (range completo):`)
for (const [id, s] of perRT) {
  const rt = rtMap.get(id)
  const days = s.dates.size
  const cap = (rt?.total_rooms || 0) * days
  console.log(`  ${rt?.name || id}:`)
  console.log(`    days=${days}  total_rooms_seen={${[...s.totRooms].join(",")}} (DB=${rt?.total_rooms})`)
  console.log(`    capacity=${cap}  avail=${s.totalAvail}  occupied=${s.occupiedDays}  oos=${s.totalOOS}  sum=${s.totalAvail + s.occupiedDays + s.totalOOS}`)
  console.log(`    occ%=${cap > 0 ? ((s.occupiedDays/cap)*100).toFixed(1) : '-'}  sources=${[...s.sources].join(",")}`)
}

// Per mese: somma vendute vs disponibili
const monthly = new Map()
for (const r of avail || []) {
  const m = r.date.slice(0, 7)
  if (!monthly.has(m)) monthly.set(m, { dates: new Set(), sumTot: 0, sumAvail: 0, sumOOS: 0 })
  const x = monthly.get(m)
  x.dates.add(r.date)
  x.sumTot += r.total_rooms
  x.sumAvail += (r.rooms_available || 0)
  x.sumOOS += (r.rooms_out_of_service || 0)
}
console.log(`\nPer mese:`)
console.log(`Mese    | gg | RoomNights tot | venduti | disponibili | OOS | occ%`)
for (const [m, x] of [...monthly].sort()) {
  const occ = x.sumTot - x.sumAvail - x.sumOOS
  const occPerc = x.sumTot > 0 ? ((occ / x.sumTot) * 100).toFixed(1) : "-"
  console.log(`${m} | ${String(x.dates.size).padStart(2)} | ${String(x.sumTot).padStart(14)} | ${String(occ).padStart(7)} | ${String(x.sumAvail).padStart(11)} | ${String(x.sumOOS).padStart(3)} | ${occPerc}%`)
}

// Anomalie: settembre punto per punto
console.log(`\nDettaglio settembre 2026 (per giorno):`)
const sept = (avail || []).filter(r => r.date.startsWith("2026-09"))
const sepByDate = new Map()
for (const r of sept) {
  if (!sepByDate.has(r.date)) sepByDate.set(r.date, [])
  sepByDate.get(r.date).push(r)
}
console.log(`Data       | totHotel | venduti | disp | OOS | dettaglio`)
for (const [date, rows] of [...sepByDate].sort()) {
  let tot = 0, avl = 0, oos = 0
  const detail = []
  for (const r of rows) {
    tot += r.total_rooms
    avl += (r.rooms_available || 0)
    oos += (r.rooms_out_of_service || 0)
    const rt = rtMap.get(r.room_type_id)
    detail.push(`${(rt?.name || '?').slice(0,3)}=${r.rooms_available}/${r.total_rooms}`)
  }
  const sold = tot - avl - oos
  console.log(`${date} | ${String(tot).padStart(8)} | ${String(sold).padStart(7)} | ${String(avl).padStart(4)} | ${String(oos).padStart(3)} | ${detail.join(" ")}`)
}

// Verifica righe duplicate (stessa hotel/room_type/date due volte)
console.log(`\nDuplicati (stesso hotel/room_type/date):`)
const dupKey = new Map()
for (const r of avail || []) {
  const k = `${r.date}|${r.room_type_id}`
  dupKey.set(k, (dupKey.get(k) || 0) + 1)
}
const dups = [...dupKey].filter(([_, n]) => n > 1)
console.log(`Trovati ${dups.length} duplicati. Primi 10:`, dups.slice(0, 10))
