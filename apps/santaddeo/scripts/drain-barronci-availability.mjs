// One-off (20/07/2026): svuota il backlog di scidoo_raw_availability non
// processato per Villa I Barronci, replicando ESATTAMENTE la logica di
// ScidooMapper.mapAvailability + AvailabilityProcessor, e allinea
// daily_availability / rms_availability_daily alla verita' di Scidoo.
// Serve a correggere la dashboard live (camere "libere" in realta' vendute)
// PRIMA del deploy del drain-loop strutturale.
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HOTEL_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca" // Villa I Barronci
const DRY_RUN = process.argv.includes("--dry-run")

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })

function mapAvailability(raw, scidooToUuid, capacityMap) {
  const roomTypeId = scidooToUuid[String(raw.scidoo_room_type_id)] || null
  const rd = raw.raw_data || {}
  const availableCount = Number(rd.available_count) || 0
  const occupiedCount = Number(rd.occupied_count) || 0
  const oosFromScidoo = Number(rd.rooms_out_of_service) || 0
  const sumCount = availableCount + occupiedCount
  const fallbackCapacity = roomTypeId ? capacityMap.get(roomTypeId) || 0 : 0
  const totalRooms = Number(rd.total_rooms) || sumCount || fallbackCapacity || 0
  const reconstructedFromFallback = !rd.total_rooms && sumCount === 0 && fallbackCapacity > 0
  const roomsOutOfService = reconstructedFromFallback ? totalRooms : oosFromScidoo
  return roomTypeId
    ? {
        hotel_id: HOTEL_ID,
        room_type_id: roomTypeId,
        date: raw.date,
        rooms_available: availableCount,
        total_rooms: totalRooms,
        rooms_out_of_service: roomsOutOfService,
        source: "scidoo",
        imported_at: new Date().toISOString(),
      }
    : null
}

async function main() {
  const { data: roomTypes } = await sb
    .from("room_types")
    .select("id, scidoo_room_type_id, total_rooms, name")
    .eq("hotel_id", HOTEL_ID)
    .eq("is_active", true)

  const scidooToUuid = {}
  const capacityMap = new Map()
  const activeIds = []
  for (const rt of roomTypes || []) {
    if (rt.scidoo_room_type_id) {
      scidooToUuid[String(rt.scidoo_room_type_id)] = rt.id
      capacityMap.set(rt.id, rt.total_rooms || 0)
      activeIds.push(String(rt.scidoo_room_type_id))
    }
  }
  console.log(`Tipologie attive mappate: ${activeIds.length}  DRY_RUN=${DRY_RUN}`)

  let totalProcessed = 0
  let totalUpserted = 0
  let iteration = 0
  const FETCH_LIMIT = 1000
  while (iteration < 50) {
    iteration++
    const { data: raws, error } = await sb
      .from("scidoo_raw_availability")
      .select("*")
      .eq("hotel_id", HOTEL_ID)
      .eq("processed", false)
      .in("scidoo_room_type_id", activeIds)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .limit(FETCH_LIMIT)
    if (error) throw new Error(error.message)
    if (!raws || raws.length === 0) break

    const batch = []
    const ids = []
    for (const r of raws) {
      const m = mapAvailability(r, scidooToUuid, capacityMap)
      if (m) {
        batch.push({ ...m, updated_at: new Date().toISOString() })
        ids.push(r.id)
      }
    }
    console.log(`  iter ${iteration}: raw=${raws.length} mappati=${batch.length}`)
    totalProcessed += raws.length

    if (!DRY_RUN && batch.length > 0) {
      for (let i = 0; i < batch.length; i += 500) {
        const chunk = batch.slice(i, i + 500)
        const { error: e1 } = await sb
          .from("daily_availability")
          .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
        if (e1) throw new Error("daily_availability: " + e1.message)
        const { error: e2 } = await sb
          .from("rms_availability_daily")
          .upsert(chunk, { onConflict: "hotel_id,room_type_id,date", ignoreDuplicates: false })
        if (e2) console.warn("  rms mirror err:", e2.message)
        totalUpserted += chunk.length
      }
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500)
        await sb
          .from("scidoo_raw_availability")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .in("id", chunk)
      }
    }
    if (raws.length < FETCH_LIMIT) break
  }
  console.log(`\nDONE. processati=${totalProcessed} upsertati=${totalUpserted} (iterazioni=${iteration})`)

  // Verifica finale su oggi
  const { data: today } = await sb
    .from("daily_availability")
    .select("room_type_id, rooms_available, total_rooms, rooms_out_of_service, source, updated_at")
    .eq("hotel_id", HOTEL_ID)
    .eq("date", "2026-07-20")
  let freeSum = 0
  for (const r of today || []) freeSum += Number(r.rooms_available) || 0
  console.log(`Camere libere in daily_availability per 2026-07-20 dopo il fix: ${freeSum}`)
}

main().catch((e) => {
  console.error("ERRORE:", e.message)
  process.exit(1)
})
