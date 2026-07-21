/**
 * Full Scidoo Resync Script for Villa I Barronci (Santaddeo)
 * 
 * This script performs a complete resync:
 * 1. Triggers ScidooSyncService full sync (initial mode) for the hotel
 * 2. Reprocesses ETL pipeline: scidoo_raw_bookings -> bookings
 * 3. Verifies the results with cancellation count query
 */

import { createClient } from "@supabase/supabase-js"

// Villa I Barronci hotel ID
const HOTEL_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function step1_triggerFullSync() {
  console.log("\n========================================")
  console.log("STEP 1: Triggering ScidooSyncService Full Sync")
  console.log("========================================\n")
  console.log("Hotel ID:", HOTEL_ID)

  // Get PMS integration
  const { data: pmsIntegration, error: pmsError } = await supabase
    .from("pms_integrations")
    .select("*")
    .eq("hotel_id", HOTEL_ID)
    .eq("pms_name", "scidoo")
    .eq("is_active", true)
    .maybeSingle()

  if (pmsError || !pmsIntegration) {
    console.error("PMS integration not found:", pmsError)
    throw new Error("PMS integration not found for hotel")
  }

  console.log("PMS Integration found:", {
    id: pmsIntegration.id,
    pms_name: pmsIntegration.pms_name,
    property_id: pmsIntegration.property_id,
  })

  const apiKey = pmsIntegration.api_key
  const config = pmsIntegration.config || {}
  const propertyId = pmsIntegration.property_id || config.property_id

  if (!apiKey) {
    throw new Error("API key not configured for PMS integration")
  }

  // Calculate date range: 2 years back + 1 year forward
  const today = new Date()
  const startDate = new Date(today)
  startDate.setFullYear(startDate.getFullYear() - 2)
  const endDate = new Date(today)
  endDate.setFullYear(endDate.getFullYear() + 1)

  const startDateStr = startDate.toISOString().split("T")[0]
  const endDateStr = endDate.toISOString().split("T")[0]

  console.log("\nDate range:", startDateStr, "to", endDateStr)

  // First, clear processed flag on all raw bookings to force reprocessing
  console.log("\nClearing processed flag on existing raw bookings...")
  const { error: clearError } = await supabase
    .from("scidoo_raw_bookings")
    .update({ processed: false })
    .eq("hotel_id", HOTEL_ID)
  
  if (clearError) {
    console.warn("Warning: Could not clear processed flag:", clearError.message)
  } else {
    console.log("Processed flags cleared.")
  }

  // Use the Scidoo API directly
  console.log("\nFetching all bookings from Scidoo API (initial mode)...")

  const scidooEndpoint = "https://www.scidoo.com/api/v1/bookings/get.php"
  const response = await fetch(scidooEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
    },
    body: JSON.stringify({
      property_id: propertyId,
      checkin_from: startDateStr,
      checkin_to: endDateStr,
    }),
  })

  if (!response.ok) {
    throw new Error("Scidoo API error: " + response.status + " " + response.statusText)
  }

  const bookingsResult = await response.json()
  const bookings = bookingsResult.reservations || []
  console.log("Fetched", bookings.length, "bookings from Scidoo API")

  // Deduplicate by booking ID
  const uniqueBookings = new Map()
  for (const booking of bookings) {
    const key = booking.id || booking.internal_id
    if (!uniqueBookings.has(key)) {
      uniqueBookings.set(key, booking)
    }
  }
  console.log("Deduplicated to", uniqueBookings.size, "unique bookings")

  // Count cancelled bookings from raw data
  let cancelledCount = 0
  for (const booking of uniqueBookings.values()) {
    const status = (booking.status || "").toLowerCase()
    if (status === "cancellata" || status === "cancelled" || status === "canceled") {
      cancelledCount++
    }
  }
  console.log("Found", cancelledCount, "cancelled bookings in raw Scidoo data")

  // Build scidoo_room_type_id -> room_type_name lookup
  const { data: roomTypesLookup } = await supabase
    .from("room_types")
    .select("name,scidoo_room_type_id")
    .eq("hotel_id", HOTEL_ID)
  const scidooRtIdToName = {}
  for (const rt of roomTypesLookup || []) {
    if (rt.scidoo_room_type_id) scidooRtIdToName[String(rt.scidoo_room_type_id)] = rt.name
  }
  console.log("Room type lookup built:", Object.keys(scidooRtIdToName).length, "entries:", JSON.stringify(scidooRtIdToName))

  // Import to scidoo_raw_bookings
  const bookingsArray = Array.from(uniqueBookings.values())
  const batchSize = 100
  let imported = 0

  console.log("\nImporting to scidoo_raw_bookings table...")
  for (let i = 0; i < bookingsArray.length; i += batchSize) {
    const batch = bookingsArray.slice(i, i + batchSize)

    const records = batch.map(function(booking) {
      // Calculate room-only total from daily_price
      let roomTotal = 0
      if (booking.daily_price && typeof booking.daily_price === "object" && !Array.isArray(booking.daily_price)) {
        roomTotal = Object.values(booking.daily_price).reduce(function(sum, v) { return sum + (parseFloat(v) || 0) }, 0)
      }
      const rtId = String(booking.room_type_id || "")
      const rtName = booking.room_type_name || booking.room_type || scidooRtIdToName[rtId] || null
      const channel = (booking.agency && booking.agency.name) ? booking.agency.name : "Direct"

      return {
        hotel_id: HOTEL_ID,
        pms_integration_id: pmsIntegration.id,
        scidoo_booking_id: String(booking.id || booking.internal_id),
        pms_booking_id: String(booking.id || booking.internal_id),
        raw_data: booking,
        checkin_date: booking.checkin_date,
        checkout_date: booking.checkout_date,
        status: booking.status,
        room_type_name: rtName,
        room_type_code: rtId || null,
        total_amount: roomTotal || null,
        channel: channel,
        rate_code: booking.rate_id ? String(booking.rate_id) : null,
        rate_name: booking.rate_name || null,
        guests_count: parseInt(booking.guest_count) || (booking.guests ? booking.guests.length : null),
        adults_count: parseInt(booking.adult_count) || null,
        children_count: parseInt(booking.child_count) || null,
        customer_first_name: booking.customer ? booking.customer.first_name : null,
        customer_last_name: booking.customer ? booking.customer.last_name : null,
        customer_email: booking.customer ? booking.customer.email : null,
        customer_country: booking.customer ? booking.customer.citizenship : null,
        booking_date: booking.creation || null,
        cancellation_date: booking.cancellation || null,
        synced_at: new Date().toISOString(),
        processed: false,
      }
    })

    const { error } = await supabase
      .from("scidoo_raw_bookings")
      .upsert(records, { onConflict: "hotel_id,scidoo_booking_id" })

    if (error) {
      console.error("Batch", Math.floor(i / batchSize) + 1, "error:", error.message)
    } else {
      imported += batch.length
      console.log("Batch", Math.floor(i / batchSize) + 1 + ":", imported, "records imported")
    }
  }

  console.log("\nStep 1 Complete:", imported, "raw bookings imported to scidoo_raw_bookings")
  return { imported: imported, cancelledInRaw: cancelledCount }
}

async function step2_reprocessETL() {
  console.log("\n========================================")
  console.log("STEP 2: Reprocessing ETL Pipeline")
  console.log("scidoo_raw_bookings -> bookings")
  console.log("========================================\n")

  // Count unprocessed bookings
  const { count: unprocessedCount } = await supabase
    .from("scidoo_raw_bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)
    .eq("processed", false)

  console.log("Found", unprocessedCount, "unprocessed raw bookings")

  if (!unprocessedCount || unprocessedCount === 0) {
    console.log("No unprocessed bookings to process.")
    return { processed: 0, inserted: 0, updated: 0, failed: 0 }
  }

  // Load room types cache
  console.log("Loading room types cache...")
  const { data: roomTypesData } = await supabase
    .from("room_types")
    .select("id, pms_room_type_id, name")
    .eq("hotel_id", HOTEL_ID)

  const roomTypesCache = new Map()
  if (roomTypesData) {
    for (const rt of roomTypesData) {
      roomTypesCache.set(rt.pms_room_type_id, rt.id)
    }
  }
  console.log("Room types cache loaded:", roomTypesCache.size, "entries")

  // Process in batches
  let processed = 0
  let inserted = 0
  let updated = 0
  let failed = 0
  const batchSize = 50

  while (true) {
    // Fetch batch of unprocessed bookings
    const { data: rawBookings, error: fetchError } = await supabase
      .from("scidoo_raw_bookings")
      .select("*")
      .eq("hotel_id", HOTEL_ID)
      .eq("processed", false)
      .order("synced_at", { ascending: true })
      .limit(batchSize)

    if (fetchError) {
      console.error("Error fetching raw bookings:", fetchError.message)
      break
    }

    if (!rawBookings || rawBookings.length === 0) {
      console.log("No more unprocessed bookings.")
      break
    }

    console.log("Processing batch of", rawBookings.length, "bookings...")

    for (const rawBooking of rawBookings) {
      processed++

      try {
        const raw = rawBooking.raw_data || rawBooking
        
        // Map to normalized booking format
        const normalizedBooking = mapBookingToAgnostic(raw, HOTEL_ID, roomTypesCache)

        // Check if booking exists
        const { data: existing } = await supabase
          .from("bookings")
          .select("id")
          .eq("hotel_id", HOTEL_ID)
          .eq("pms_booking_id", normalizedBooking.pms_booking_id)
          .single()

        if (existing) {
          // Update existing booking
          const { error: updateError } = await supabase
            .from("bookings")
            .update(Object.assign({}, normalizedBooking, {
              updated_at: new Date().toISOString(),
            }))
            .eq("id", existing.id)

          if (updateError) throw updateError
          updated++
        } else {
          // Insert new booking
          const { error: insertError } = await supabase
            .from("bookings")
            .insert(normalizedBooking)

          if (insertError) throw insertError
          inserted++
        }

        // Mark as processed
        await supabase
          .from("scidoo_raw_bookings")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("id", rawBooking.id)

      } catch (error) {
        failed++
        console.error("Error processing booking", rawBooking.scidoo_booking_id + ":", error)
        
        // Still mark as processed to avoid infinite loop
        await supabase
          .from("scidoo_raw_bookings")
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq("id", rawBooking.id)
      }
    }

    console.log("Progress:", processed, "processed,", inserted, "inserted,", updated, "updated,", failed, "failed")
  }

  console.log("\nStep 2 Complete:")
  console.log("  - Processed:", processed)
  console.log("  - Inserted:", inserted)
  console.log("  - Updated:", updated)
  console.log("  - Failed:", failed)

  return { processed: processed, inserted: inserted, updated: updated, failed: failed }
}

function mapBookingToAgnostic(raw, hotelId, roomTypesCache) {
  // Determine cancellation status
  const status = (raw.status || "").toLowerCase()
  const isCancelled = status === "cancellata" || status === "cancelled" || status === "canceled"

  // Map room type
  let scidooRoomTypeId = ""
  if (raw.room_type_id) {
    scidooRoomTypeId = String(raw.room_type_id)
  } else if (raw.list_date_type_room && raw.list_date_type_room[0]) {
    scidooRoomTypeId = String(raw.list_date_type_room[0].room_type_id || "")
  }
  const roomTypeId = roomTypesCache.get(scidooRoomTypeId) || null

  // Calculate room-only price from daily_price
  let roomOnlyPrice = 0
  if (raw.daily_price && typeof raw.daily_price === "object" && !Array.isArray(raw.daily_price)) {
    roomOnlyPrice = Object.values(raw.daily_price).reduce(function(sum, val) { 
      return sum + (Number(val) || 0) 
    }, 0)
  }
  const extrasPrice = parseFloat(raw.extra_price) || 0
  const totalPrice = roomOnlyPrice + extrasPrice

  // Customer info
  const customer = raw.customer || {}
  const nameParts = [customer.first_name, customer.last_name].filter(Boolean)
  const customerName = nameParts.length > 0 ? nameParts.join(" ") : "Guest"
  const customerEmail = customer.email || null

  // Get guests info
  const guests = raw.guests || []
  let adults = 1
  let children = 0
  if (guests.length > 0) {
    adults = guests.filter(function(g) { 
      const gType = (g.type || "").toLowerCase()
      return gType === "adulto" 
    }).length || 1
    children = guests.filter(function(g) { 
      const gType = (g.type || "").toLowerCase()
      return gType !== "adulto" 
    }).length
  } else if (raw.adults) {
    adults = raw.adults
  }

  // Get source/origin
  let source = "Scidoo"
  if (raw.origin && typeof raw.origin === "object" && raw.origin.name) {
    source = raw.origin.name
  } else if (typeof raw.origin === "string") {
    source = raw.origin
  }

  return {
    hotel_id: hotelId,
    pms_booking_id: String(raw.id || raw.internal_id),
    checkin_date: raw.checkin_date,
    checkout_date: raw.checkout_date,
    check_in_date: raw.checkin_date,
    check_out_date: raw.checkout_date,
    number_of_nights: Math.max(1, Math.round((new Date(raw.checkout_date) - new Date(raw.checkin_date)) / 86400000)),
    room_type_id: roomTypeId,
    pms_room_type_id: scidooRoomTypeId || null,
    total_price: totalPrice,
    net_price: roomOnlyPrice,
    extras_revenue: extrasPrice,
    channel: (raw.agency && raw.agency.name) ? raw.agency.name : "Direct",
    status: raw.status || "unknown",
    is_cancelled: isCancelled,
    customer_name: customerName,
    customer_email: customerEmail,
    source: source,
    adults: adults,
    children: children,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function step3_verifyResults() {
  console.log("\n========================================")
  console.log("STEP 3: Verifying Results")
  console.log("========================================\n")

  // Run verification query
  const { count: totalCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)

  const { count: cancelledCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)
    .eq("is_cancelled", true)

  const total = totalCount || 0
  const cancelled = cancelledCount || 0

  console.log("Verification Query Results:")
  console.log("---------------------------")
  console.log("  Total bookings:", total)
  console.log("  Cancelled:     ", cancelled)
  console.log("  Active:        ", total - cancelled)
  if (total > 0) {
    console.log("  Cancellation %:", ((cancelled / total) * 100).toFixed(2) + "%")
  }

  // Also check raw data for comparison
  const { count: rawCount } = await supabase
    .from("scidoo_raw_bookings")
    .select("*", { count: "exact", head: true })
    .eq("hotel_id", HOTEL_ID)

  console.log("\n  Raw bookings:  ", rawCount)

  return { total: total, cancelled: cancelled }
}

async function main() {
  console.log("\n================================================")
  console.log("  SANTADDEO - Full Scidoo Resync Script")
  console.log("  Hotel: Villa I Barronci")
  console.log("  ID:", HOTEL_ID)
  console.log("================================================")

  try {
    // Step 1: Full sync from Scidoo
    const step1Result = await step1_triggerFullSync()

    // Step 2: Reprocess ETL
    const step2Result = await step2_reprocessETL()

    // Step 3: Verify results
    const step3Result = await step3_verifyResults()

    console.log("\n================================================")
    console.log("  RESYNC COMPLETE - SUMMARY")
    console.log("================================================")
    console.log("\n  Step 1 (Raw Import):", step1Result.imported, "bookings imported")
    console.log("    - Cancelled in raw data:", step1Result.cancelledInRaw)
    console.log("\n  Step 2 (ETL Transform):")
    console.log("    - Processed:", step2Result.processed)
    console.log("    - Inserted: ", step2Result.inserted)
    console.log("    - Updated:  ", step2Result.updated)
    console.log("    - Failed:   ", step2Result.failed)
    console.log("\n  Step 3 (Verification):")
    if (step3Result) {
      console.log("    - Total bookings: ", step3Result.total)
      console.log("    - Cancelled:      ", step3Result.cancelled)
    }
    console.log("\n================================================")
    console.log("  Please verify dashboard and bookings page match!")
    console.log("================================================\n")

  } catch (error) {
    console.error("\nResync failed:", error)
    process.exit(1)
  }
}

main()
