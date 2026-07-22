// Recover historical bookings using stay_from/stay_to parameter
const SUPABASE_URL = "https://aeynirkfixurikshxfov.supabase.co"
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
}
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SCIDOO_BASE = "https://www.scidoo.com/api/v1"
const HOTEL_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"

async function main() {
  // Step 1: Get API key from pms_integrations
  console.log("Step 1: Getting API key...")
  const pmsRes = await fetch(
    SUPABASE_URL + "/rest/v1/pms_integrations?hotel_id=eq." + HOTEL_ID + "&is_active=eq.true&select=api_key,property_id,id",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
  )
  const pmsData = await pmsRes.json()
  if (!pmsData || pmsData.length === 0) { console.error("No PMS integration found"); return }
  const API_KEY = pmsData[0].api_key
  const PMS_ID = pmsData[0].id
  console.log("API key found, PMS ID:", PMS_ID)

  // Step 2: Get room type mapping
  console.log("Step 2: Loading room type mapping...")
  const rtRes = await fetch(
    SUPABASE_URL + "/rest/v1/room_types?hotel_id=eq." + HOTEL_ID + "&select=name,scidoo_room_type_id,id",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
  )
  const roomTypes = await rtRes.json()
  const rtMap = {}
  for (const rt of roomTypes || []) {
    if (rt.scidoo_room_type_id) rtMap[String(rt.scidoo_room_type_id)] = { name: rt.name, id: rt.id }
  }
  console.log("Room type mapping:", Object.keys(rtMap).length, "entries")

  // Step 3: Fetch historical bookings using stay_from/stay_to (not checkin_from)
  // Go back to 2025-03-01 (about 13 months ago) to get full history
  console.log("Step 3: Fetching historical bookings from Scidoo...")
  const allBookings = []
  const existingIds = new Set()

  // Get existing booking IDs to avoid duplicates
  const existRes = await fetch(
    SUPABASE_URL + "/rest/v1/scidoo_raw_bookings?hotel_id=eq." + HOTEL_ID + "&select=pms_booking_id",
    { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
  )
  const existing = await existRes.json()
  for (const e of existing || []) { existingIds.add(e.pms_booking_id) }
  console.log("Existing bookings:", existingIds.size)

  // Fetch in monthly chunks using stay_from/stay_to
  const startDate = new Date("2025-03-01")
  const endDate = new Date("2026-04-03") // Up to where we already have data
  
  let current = new Date(startDate)
  while (current < endDate) {
    const chunkEnd = new Date(current)
    chunkEnd.setMonth(chunkEnd.getMonth() + 1)
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime())
    
    const fromStr = current.toISOString().split("T")[0]
    const toStr = chunkEnd.toISOString().split("T")[0]
    
    console.log("  Fetching stay_from=" + fromStr + " stay_to=" + toStr + "...")
    
    try {
      const res = await fetch(SCIDOO_BASE + "/bookings/getBookings.php", {
        method: "POST",
        headers: { "Api-Key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ stay_from: fromStr, stay_to: toStr })
      })
      
      if (!res.ok) {
        const errText = await res.text()
        console.log("  Error " + res.status + ": " + errText.substring(0, 200))
        // Try alternate endpoint
        const res2 = await fetch(SCIDOO_BASE + "/bookings/get.php", {
          method: "POST",
          headers: { "Api-Key": API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ stay_from: fromStr, stay_to: toStr })
        })
        if (!res2.ok) {
          console.log("  Alternate also failed:", res2.status)
          current = new Date(chunkEnd)
          continue
        }
        const data2 = await res2.json()
        const bks2 = data2.reservations || data2.bookings || []
        const newBks2 = bks2.filter(b => !existingIds.has(String(b.id || b.internal_id)))
        console.log("  Got " + bks2.length + " bookings, " + newBks2.length + " new")
        allBookings.push(...newBks2)
        for (const b of newBks2) existingIds.add(String(b.id || b.internal_id))
      } else {
        const data = await res.json()
        const bookings = data.reservations || data.bookings || []
        const newBookings = bookings.filter(b => !existingIds.has(String(b.id || b.internal_id)))
        console.log("  Got " + bookings.length + " bookings, " + newBookings.length + " new")
        allBookings.push(...newBookings)
        for (const b of newBookings) existingIds.add(String(b.id || b.internal_id))
      }
    } catch (err) {
      console.log("  Fetch error:", err.message)
    }
    
    current = new Date(chunkEnd)
  }
  
  // Also try checkin_from with very old date
  console.log("  Also trying checkin_from=2025-01-01...")
  try {
    const res3 = await fetch(SCIDOO_BASE + "/bookings/getBookings.php", {
      method: "POST",
      headers: { "Api-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ checkin_from: "2025-01-01", checkin_to: "2026-04-03" })
    })
    if (res3.ok) {
      const data3 = await res3.json()
      const bks3 = data3.reservations || data3.bookings || []
      const newBks3 = bks3.filter(b => !existingIds.has(String(b.id || b.internal_id)))
      console.log("  checkin_from got " + bks3.length + " bookings, " + newBks3.length + " new")
      allBookings.push(...newBks3)
    } else {
      // Try /bookings/get.php
      const res4 = await fetch(SCIDOO_BASE + "/bookings/get.php", {
        method: "POST",
        headers: { "Api-Key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ checkin_from: "2025-01-01", checkin_to: "2026-04-03" })
      })
      if (res4.ok) {
        const data4 = await res4.json()
        const bks4 = data4.reservations || data4.bookings || []
        const newBks4 = bks4.filter(b => !existingIds.has(String(b.id || b.internal_id)))
        console.log("  /get.php checkin_from got " + bks4.length + " bookings, " + newBks4.length + " new")
        allBookings.push(...newBks4)
      } else {
        console.log("  /get.php checkin_from also failed:", res4.status)
      }
    }
  } catch (err) {
    console.log("  checkin_from fetch error:", err.message)
  }

  console.log("\nTotal new historical bookings found:", allBookings.length)
  
  if (allBookings.length === 0) {
    console.log("No historical bookings recovered. Scidoo API does not return past bookings.")
    console.log("Historical occupancy/production data cannot be recovered from Scidoo.")
    return
  }

  // Step 4: Insert recovered bookings
  console.log("Step 4: Inserting recovered bookings...")
  const batchSize = 50
  let inserted = 0
  
  for (let i = 0; i < allBookings.length; i += batchSize) {
    const batch = allBookings.slice(i, i + batchSize)
    const records = batch.map(function(booking) {
      const rtId = String(booking.room_type_id || "")
      const rtInfo = rtMap[rtId] || {}
      let roomTotal = 0
      if (booking.daily_price && typeof booking.daily_price === "object" && !Array.isArray(booking.daily_price)) {
        roomTotal = Object.values(booking.daily_price).reduce(function(s, v) { return s + (parseFloat(v) || 0) }, 0)
      }
      return {
        hotel_id: HOTEL_ID,
        pms_integration_id: PMS_ID,
        scidoo_booking_id: String(booking.id || booking.internal_id),
        pms_booking_id: String(booking.id || booking.internal_id),
        raw_data: booking,
        checkin_date: booking.checkin_date,
        checkout_date: booking.checkout_date,
        status: booking.status,
        room_type_name: booking.room_type_name || booking.room_type || rtInfo.name || null,
        room_type_code: rtId || null,
        total_amount: roomTotal || null,
        channel: (booking.agency && booking.agency.name) ? booking.agency.name : "Direct",
        synced_at: new Date().toISOString(),
        processed: false,
      }
    })

    const insRes = await fetch(SUPABASE_URL + "/rest/v1/scidoo_raw_bookings", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(records)
    })
    
    if (insRes.ok) {
      inserted += batch.length
      console.log("  Inserted batch " + Math.floor(i/batchSize + 1) + ": " + inserted + "/" + allBookings.length)
    } else {
      console.log("  Insert error:", insRes.status, await insRes.text())
    }
  }

  console.log("\nDone! Inserted " + inserted + " historical bookings")
}

main().catch(err => console.error("Fatal:", err.message))
