const SUPABASE_URL = "https://aeynirkfixurikshxfov.supabase.co"
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
}
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HOTEL_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"
const PMS_INTEGRATION_ID = "a9e6961d-f852-4448-b90e-fa9bd4b9878f"
const API_KEY = "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y="
const PROPERTY_ID = "1131"
const SCIDOO_BASE = "https://www.scidoo.com/api/v1"

const SB_HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": "Bearer " + SUPABASE_KEY,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates"
}

async function sbQuery(table, query) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + query, { headers: SB_HEADERS })
  if (!res.ok) throw new Error("SB GET " + table + ": " + res.status + " " + await res.text())
  return res.json()
}

async function sbUpsert(table, records) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table, {
    method: "POST",
    headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(records)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error("SB UPSERT " + table + ": " + res.status + " " + txt)
  }
}

async function main() {
  console.log("=== RESTORE BOOKINGS ===")

  // 1. Build room_type lookup
  const roomTypes = await sbQuery("room_types", "select=id,name,scidoo_room_type_id&hotel_id=eq." + HOTEL_ID)
  const rtLookup = {}
  const rtNameToId = {}
  for (const rt of roomTypes) {
    if (rt.scidoo_room_type_id) rtLookup[String(rt.scidoo_room_type_id)] = rt.name
    rtNameToId[rt.name] = rt.id
  }
  console.log("Room types:", Object.keys(rtLookup).length)

  // 2. Fetch bookings from Scidoo in 3-month chunks
  const today = new Date()
  const start = new Date(today); start.setFullYear(start.getFullYear() - 2)
  const end = new Date(today); end.setFullYear(end.getFullYear() + 1)
  
  let allBookings = []
  let chunkStart = new Date(start)
  
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart)
    chunkEnd.setMonth(chunkEnd.getMonth() + 3)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())
    
    const fromStr = chunkStart.toISOString().split("T")[0]
    const toStr = chunkEnd.toISOString().split("T")[0]
    
    // Scidoo v1 API: POST /bookings/get.php with JSON body, Api-Key header
    const res = await fetch(SCIDOO_BASE + "/bookings/get.php", {
      method: "POST",
      headers: { "Api-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ checkin_from: fromStr, checkin_to: toStr })
    })
    if (!res.ok) { console.error("Scidoo error:", res.status, await res.text()); chunkStart = new Date(chunkEnd); chunkStart.setDate(chunkStart.getDate() + 1); continue }
    
    const data = await res.json()
    const bookings = data.reservations || []
    console.log("  " + fromStr + " -> " + toStr + ": " + bookings.length + " bookings")
    allBookings = allBookings.concat(bookings)
    
    chunkStart = new Date(chunkEnd)
    chunkStart.setDate(chunkStart.getDate() + 1)
    await new Promise(r => setTimeout(r, 300))
  }
  
  console.log("\nTotal from Scidoo: " + allBookings.length)
  if (allBookings.length === 0) { console.error("NO BOOKINGS!"); return }

  // 3. Deduplicate
  const uniqueMap = new Map()
  for (const bk of allBookings) uniqueMap.set(String(bk.id || bk.internal_id), bk)
  const unique = Array.from(uniqueMap.values())
  console.log("Unique: " + unique.length)

  // 4. Import to scidoo_raw_bookings
  const batchSize = 50
  let imported = 0
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    const records = batch.map(bk => {
      const rtId = String(bk.room_type_id || "")
      const rtName = bk.room_type_name || bk.room_type || rtLookup[rtId] || null
      const channel = (bk.agency && bk.agency.name) ? bk.agency.name : "Direct"
      let roomTotal = 0
      if (bk.daily_price && typeof bk.daily_price === "object" && !Array.isArray(bk.daily_price)) {
        roomTotal = Object.values(bk.daily_price).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      }
      return {
        hotel_id: HOTEL_ID,
        pms_integration_id: PMS_INTEGRATION_ID,
        scidoo_booking_id: String(bk.id || bk.internal_id),
        pms_booking_id: String(bk.id || bk.internal_id),
        raw_data: bk,
        checkin_date: bk.checkin_date,
        checkout_date: bk.checkout_date,
        status: bk.status,
        room_type_name: rtName,
        room_type_code: rtId || null,
        total_amount: roomTotal || null,
        channel: channel,
        rate_code: bk.rate_id ? String(bk.rate_id) : null,
        booking_date: bk.creation || null,
        synced_at: new Date().toISOString(),
        processed: false,
      }
    })
    try {
      await sbUpsert("scidoo_raw_bookings", records)
      imported += batch.length
      if (imported % 200 === 0 || imported === unique.length) console.log("  Raw imported: " + imported + "/" + unique.length)
    } catch (e) { console.error("  Batch " + i + " error:", e.message) }
  }
  console.log("Raw bookings imported: " + imported)

  // 5. ETL: raw -> bookings
  console.log("\nRunning ETL...")
  // Re-read all raw bookings
  let rawBookings = []
  let offset = 0
  while (true) {
    const batch = await sbQuery("scidoo_raw_bookings", "select=*&hotel_id=eq." + HOTEL_ID + "&order=pms_booking_id.asc&limit=1000&offset=" + offset)
    if (batch.length === 0) break
    rawBookings = rawBookings.concat(batch)
    offset += batch.length
  }
  console.log("Raw bookings to process: " + rawBookings.length)

  let processed = 0
  for (let i = 0; i < rawBookings.length; i += batchSize) {
    const batch = rawBookings.slice(i, i + batchSize)
    const records = batch.map(rb => {
      const raw = rb.raw_data || {}
      const rtId = String(raw.room_type_id || "")
      const rtName = rb.room_type_name || rtLookup[rtId] || null
      const roomTypeUuid = rtName ? rtNameToId[rtName] : null
      let roomOnlyPrice = 0
      if (raw.daily_price && typeof raw.daily_price === "object" && !Array.isArray(raw.daily_price)) {
        roomOnlyPrice = Object.values(raw.daily_price).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      }
      const extrasPrice = parseFloat(raw.extra_price) || 0
      const isCancelled = rb.status === "annullata" || rb.status === "cancelled"
      const nights = Math.max(1, Math.round((new Date(rb.checkout_date) - new Date(rb.checkin_date)) / 86400000))
      const customer = raw.customer || {}
      const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null
      const channel = (raw.agency && raw.agency.name) ? raw.agency.name : "Direct"
      return {
        hotel_id: HOTEL_ID,
        pms_booking_id: rb.pms_booking_id,
        check_in_date: rb.checkin_date,
        check_out_date: rb.checkout_date,
        checkin_date: rb.checkin_date,
        checkout_date: rb.checkout_date,
        number_of_nights: nights,
        room_type_id: roomTypeUuid,
        pms_room_type_id: rtId || null,
        total_price: roomOnlyPrice + extrasPrice,
        net_price: roomOnlyPrice,
        extras_revenue: extrasPrice,
        channel: channel,
        status: isCancelled ? "cancelled" : "confirmed",
        is_cancelled: isCancelled,
        customer_name: customerName,
        customer_email: customer.email || null,
        source: channel,
        adults: parseInt(raw.adult_count) || null,
        children: parseInt(raw.child_count) || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    })
    try {
      await sbUpsert("bookings", records)
      processed += batch.length
      if (processed % 200 === 0 || processed === rawBookings.length) console.log("  Bookings: " + processed + "/" + rawBookings.length)
    } catch (e) { console.error("  ETL batch " + i + " error:", e.message) }
  }

  // 6. Final counts
  const rawCount = await sbQuery("scidoo_raw_bookings", "select=pms_booking_id&hotel_id=eq." + HOTEL_ID + "&limit=1")
  const bkCount = await sbQuery("bookings", "select=pms_booking_id&hotel_id=eq." + HOTEL_ID + "&limit=1")
  console.log("\n=== DONE ===")
  console.log("Script complete. Check counts in Supabase dashboard.")
}

main().catch(err => { console.error("Fatal:", err); process.exit(1) })
