const { createClient } = require("@supabase/supabase-js")

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
}
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HOTEL_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"
const API_KEY = "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y="
const PROPERTY_ID = "1131"
const BASE_URL = "https://api.scidoo.com/api/v2"

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Build room_type_id -> name lookup
async function buildRoomTypeLookup() {
  const { data } = await supabase
    .from("room_types")
    .select("name,scidoo_room_type_id")
    .eq("hotel_id", HOTEL_ID)
  const map = {}
  for (const rt of data || []) {
    if (rt.scidoo_room_type_id) map[String(rt.scidoo_room_type_id)] = rt.name
  }
  console.log("Room type lookup:", JSON.stringify(map))
  return map
}

// Fetch bookings from Scidoo for a date range
async function fetchScidooBookings(from, to) {
  const url = `${BASE_URL}/bookings?property_id=${PROPERTY_ID}&date_from=${from}&date_to=${to}&per_page=500`
  console.log(`Fetching: ${from} -> ${to}`)
  
  let allBookings = []
  let page = 1
  
  while (true) {
    const pageUrl = `${url}&page=${page}`
    const res = await fetch(pageUrl, {
      headers: { "Authorization": `Bearer ${API_KEY}`, "Accept": "application/json" }
    })
    
    if (!res.ok) {
      console.error(`Scidoo API error ${res.status}: ${await res.text()}`)
      break
    }
    
    const data = await res.json()
    const bookings = data.data || data.bookings || data || []
    
    if (!Array.isArray(bookings) || bookings.length === 0) break
    
    allBookings = allBookings.concat(bookings)
    console.log(`  Page ${page}: ${bookings.length} bookings (total: ${allBookings.length})`)
    
    // Check if there are more pages
    const totalPages = data.last_page || data.meta?.last_page || 1
    if (page >= totalPages) break
    page++
  }
  
  return allBookings
}

// Import bookings into scidoo_raw_bookings
async function importBookings(bookings, rtLookup) {
  const uniqueMap = new Map()
  for (const bk of bookings) {
    const id = String(bk.id || bk.internal_id)
    // Keep the latest version (overwrite duplicates)
    uniqueMap.set(id, bk)
  }
  
  const unique = Array.from(uniqueMap.values())
  console.log(`Unique bookings to import: ${unique.length}`)
  
  const batchSize = 100
  let imported = 0
  
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    
    const records = batch.map(bk => {
      const rtId = String(bk.room_type_id || "")
      const rtName = bk.room_type_name || bk.room_type || rtLookup[rtId] || null
      const channel = (bk.agency && bk.agency.name) ? bk.agency.name : "Direct"
      
      // Calculate room-only total from daily_price
      let roomTotal = 0
      if (bk.daily_price && typeof bk.daily_price === "object" && !Array.isArray(bk.daily_price)) {
        roomTotal = Object.values(bk.daily_price).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
      }
      
      return {
        hotel_id: HOTEL_ID,
        pms_integration_id: "a9e6961d-f852-4448-b90e-fa9bd4b9878f",
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
        rate_name: bk.rate_name || null,
        guests_count: parseInt(bk.guest_count) || null,
        adults_count: parseInt(bk.adult_count) || null,
        children_count: parseInt(bk.child_count) || null,
        customer_first_name: bk.customer ? bk.customer.first_name : null,
        customer_last_name: bk.customer ? bk.customer.last_name : null,
        customer_email: bk.customer ? bk.customer.email : null,
        customer_country: bk.customer ? bk.customer.citizenship : null,
        booking_date: bk.creation || null,
        cancellation_date: bk.cancellation || null,
        synced_at: new Date().toISOString(),
        processed: false,
      }
    })
    
    const { error } = await supabase
      .from("scidoo_raw_bookings")
      .upsert(records, { onConflict: "hotel_id,pms_booking_id" })
    
    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`)
    } else {
      imported += batch.length
      console.log(`  Imported ${imported}/${unique.length}`)
    }
  }
  
  return imported
}

// Transform raw bookings into normalized bookings table
async function runETL(rtLookup) {
  console.log("\nRunning ETL: raw bookings -> bookings table...")
  
  // Load room_types with IDs
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id,name,scidoo_room_type_id")
    .eq("hotel_id", HOTEL_ID)
  
  const rtNameToId = {}
  for (const rt of roomTypes || []) {
    rtNameToId[rt.name] = rt.id
  }
  
  // Load all raw bookings
  const { data: rawBookings, error } = await supabase
    .from("scidoo_raw_bookings")
    .select("*")
    .eq("hotel_id", HOTEL_ID)
  
  if (error) {
    console.error("Error loading raw bookings:", error.message)
    return
  }
  
  console.log(`Processing ${rawBookings.length} raw bookings into bookings table...`)
  
  const batchSize = 100
  let processed = 0
  
  for (let i = 0; i < rawBookings.length; i += batchSize) {
    const batch = rawBookings.slice(i, i + batchSize)
    
    const records = batch.map(rb => {
      const raw = rb.raw_data || {}
      const rtId = String(raw.room_type_id || "")
      const rtName = rb.room_type_name || rtLookup[rtId] || null
      const roomTypeUuid = rtName ? rtNameToId[rtName] : null
      
      // Calculate prices
      let roomOnlyPrice = 0
      if (raw.daily_price && typeof raw.daily_price === "object" && !Array.isArray(raw.daily_price)) {
        roomOnlyPrice = Object.values(raw.daily_price).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
      }
      const extrasPrice = parseFloat(raw.extra_price) || 0
      const totalPrice = roomOnlyPrice + extrasPrice
      
      const isCancelled = rb.status === "annullata" || rb.status === "cancelled"
      const checkin = new Date(rb.checkin_date)
      const checkout = new Date(rb.checkout_date)
      const nights = Math.max(1, Math.round((checkout - checkin) / 86400000))
      
      // Customer info
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
        total_price: totalPrice,
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
    
    const { error: upsertError } = await supabase
      .from("bookings")
      .upsert(records, { onConflict: "hotel_id,pms_booking_id" })
    
    if (upsertError) {
      console.error(`ETL batch error at ${i}: ${upsertError.message}`)
    } else {
      processed += batch.length
      if (processed % 500 === 0 || processed === rawBookings.length) {
        console.log(`  ETL processed: ${processed}/${rawBookings.length}`)
      }
    }
  }
  
  console.log(`ETL complete: ${processed} bookings created`)
}

// Main
async function main() {
  console.log("=== RESTORE BOOKINGS FOR VILLA I BARRONCI ===")
  console.log(`Hotel: ${HOTEL_ID}`)
  console.log(`Scidoo Property: ${PROPERTY_ID}`)
  console.log("")
  
  const rtLookup = await buildRoomTypeLookup()
  
  // Fetch bookings in date range chunks (2 years back, 1 year forward)
  const today = new Date()
  const start = new Date(today)
  start.setFullYear(start.getFullYear() - 2)
  const end = new Date(today)
  end.setFullYear(end.getFullYear() + 1)
  
  let allBookings = []
  
  // Fetch in 3-month chunks to avoid API limits
  const chunkMonths = 3
  let chunkStart = new Date(start)
  
  while (chunkStart < end) {
    const chunkEnd = new Date(chunkStart)
    chunkEnd.setMonth(chunkEnd.getMonth() + chunkMonths)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())
    
    const fromStr = chunkStart.toISOString().split("T")[0]
    const toStr = chunkEnd.toISOString().split("T")[0]
    
    const bookings = await fetchScidooBookings(fromStr, toStr)
    allBookings = allBookings.concat(bookings)
    
    chunkStart = new Date(chunkEnd)
    chunkStart.setDate(chunkStart.getDate() + 1)
    
    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 500))
  }
  
  console.log(`\nTotal bookings fetched from Scidoo: ${allBookings.length}`)
  
  if (allBookings.length === 0) {
    console.error("No bookings returned from Scidoo! Check API key and property_id.")
    process.exit(1)
  }
  
  // Import to scidoo_raw_bookings
  const imported = await importBookings(allBookings, rtLookup)
  console.log(`\nImported ${imported} raw bookings`)
  
  // Run ETL to populate bookings table
  await runETL(rtLookup)
  
  // Final counts
  const { data: rawCount } = await supabase
    .from("scidoo_raw_bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)
  
  const { data: bkCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)
  
  console.log("\n=== FINAL COUNTS ===")
  console.log(`Raw bookings: ${rawCount}`)
  console.log(`Bookings: ${bkCount}`)
  console.log("=== DONE ===")
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
