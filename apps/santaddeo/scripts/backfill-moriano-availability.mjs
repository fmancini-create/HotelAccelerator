#!/usr/bin/env node
/**
 * Backfill daily_availability per Tenuta Moriano da bookings storici.
 *
 * Scopo: la pagina Obiettivi confronta YoY usando daily_availability come
 * denominatore di capacita'. Per Moriano nel 2024-2025 la tabella e' quasi
 * vuota (117 righe in tutto il 2025 invece di ~1460), quindi i confronti
 * con anno precedente sono completamente sballati (capacita' 36 invece di 300,
 * occupancy% gonfiate, delta RevPor enormi).
 *
 * Strategia: per ogni (date, room_type_id) tra 2024-01-01 e 2025-12-31:
 *   - total_rooms = room_types.total_rooms (capacita' canonica)
 *   - rooms_available = total_rooms - bookings_attivi_quel_giorno_quel_rt
 *   - rooms_out_of_service = 0 (non recuperabile retroattivamente)
 *   - source = 'backfill_from_bookings'
 *
 * I bookings senza room_type_id (10 su 1426 in 2024-2025) sono ignorati.
 * Bookings cancellati ignorati (is_cancelled = true).
 *
 * Idempotente: upsert su (hotel_id, room_type_id, date).
 */
import { createClient } from "@supabase/supabase-js"

const HOTEL_ID = "b9f9f2f4-04f1-4592-afa5-eddf445603bd"
const DATE_FROM = "2024-01-01"
const DATE_TO = "2025-12-31"

const sb = createClient(
  "https://aeynirkfixurikshxfov.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

async function main() {
  console.log(`[backfill] hotel=${HOTEL_ID} range=${DATE_FROM}..${DATE_TO}`)

  // 1) Carica room_types attivi
  const { data: roomTypes, error: rtErr } = await sb
    .from("room_types")
    .select("id, name, total_rooms")
    .eq("hotel_id", HOTEL_ID)
    .eq("is_active", true)
  if (rtErr) throw rtErr
  if (!roomTypes?.length) throw new Error("Nessun room_type attivo per l'hotel")
  const totalCapacityPerDay = roomTypes.reduce((s, r) => s + (r.total_rooms || 0), 0)
  console.log(`[backfill] room_types attivi: ${roomTypes.length}, capacita'/giorno: ${totalCapacityPerDay}`)
  for (const r of roomTypes) console.log(`  - ${r.name} (${r.id}): ${r.total_rooms} camere`)

  // 2) Carica TUTTI i bookings non cancellati che intersecano [DATE_FROM, DATE_TO]
  //    paginato per superare il limite default di 1000.
  const allBookings = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await sb
      .from("bookings")
      .select("id, room_type_id, check_in_date, check_out_date")
      .eq("hotel_id", HOTEL_ID)
      .eq("is_cancelled", false)
      .lte("check_in_date", DATE_TO)
      .gte("check_out_date", DATE_FROM)
      .not("room_type_id", "is", null)
      .order("check_in_date")
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    allBookings.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  console.log(`[backfill] bookings non cancellati con room_type_id: ${allBookings.length}`)

  // 3) Per ogni giorno e ogni room_type, conta camere occupate.
  //    occupied[date][room_type_id] = numero camere occupate
  const occupied = new Map() // dateStr -> Map<room_type_id, count>
  for (const b of allBookings) {
    if (!b.room_type_id) continue
    // Per ogni notte tra check_in (incluso) e check_out (escluso)
    const start = new Date(b.check_in_date + "T00:00:00Z")
    const end = new Date(b.check_out_date + "T00:00:00Z")
    for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = d.toISOString().slice(0, 10)
      if (ds < DATE_FROM || ds > DATE_TO) continue
      let perDay = occupied.get(ds)
      if (!perDay) {
        perDay = new Map()
        occupied.set(ds, perDay)
      }
      perDay.set(b.room_type_id, (perDay.get(b.room_type_id) || 0) + 1)
    }
  }

  // 4) Costruisci payload upsert per ogni (date, room_type)
  const payload = []
  const start = new Date(DATE_FROM + "T00:00:00Z")
  const end = new Date(DATE_TO + "T00:00:00Z")
  const nowIso = new Date().toISOString()
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const ds = d.toISOString().slice(0, 10)
    const perDay = occupied.get(ds) || new Map()
    for (const rt of roomTypes) {
      const occ = perDay.get(rt.id) || 0
      const cap = rt.total_rooms || 0
      const avail = Math.max(0, cap - occ)
      payload.push({
        hotel_id: HOTEL_ID,
        room_type_id: rt.id,
        date: ds,
        rooms_available: avail,
        total_rooms: cap,
        rooms_out_of_service: 0,
        source: "backfill_from_bookings",
        imported_at: nowIso,
      })
    }
  }
  console.log(`[backfill] payload size: ${payload.length} righe`)

  // 5) Upsert in chunk da 500
  let inserted = 0
  const CHUNK = 500
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK)
    const { error } = await sb
      .from("daily_availability")
      .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
    if (error) {
      console.error(`[backfill] errore chunk ${i}:`, error)
      throw error
    }
    inserted += chunk.length
    if ((inserted / CHUNK) % 4 === 0) console.log(`[backfill] upserted ${inserted}/${payload.length}`)
  }
  console.log(`[backfill] OK upserted ${inserted} righe`)

  // 6) Sanity check: conteggi mensili dopo il backfill
  console.log("\n[backfill] Sanity check post-backfill:")
  for (const month of ["2024-09", "2025-09", "2025-10", "2025-11", "2025-12"]) {
    const { data, error } = await sb
      .from("daily_availability")
      .select("date, total_rooms, rooms_available")
      .eq("hotel_id", HOTEL_ID)
      .gte("date", month + "-01")
      .lte("date", month + "-31")
    if (error) {
      console.log(`  ${month}: errore ${error.message}`)
      continue
    }
    let tot = 0,
      avail = 0
    for (const r of data) {
      tot += r.total_rooms || 0
      avail += r.rooms_available || 0
    }
    const occ = tot - avail
    const pct = tot ? ((occ / tot) * 100).toFixed(1) : "0"
    console.log(`  ${month}: rows=${data.length} cap=${tot} occ=${occ} (${pct}%)`)
  }
}

main().catch((e) => {
  console.error("[backfill] ERRORE:", e)
  process.exit(1)
})
