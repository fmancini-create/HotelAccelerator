// Direct import of Casanova rates from R_bzl-rooms-rates-map Google Sheet into Supabase
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GSHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY
const HOTEL_ID = "afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6"
const SPREADSHEET_ID = "1T306VgbkTDzLWP3sG4Y4u6brVKPhy7Z1KHNIgH1_Fp0"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Fetch room types for ID lookup
async function getRoomTypeMap() {
  const { data } = await supabase
    .from("room_types")
    .select("id, pms_room_type_id")
    .eq("hotel_id", HOTEL_ID)
    .eq("is_active", true)
  const map = {}
  for (const rt of data || []) {
    if (rt.pms_room_type_id) map[String(rt.pms_room_type_id)] = rt.id
  }
  return map
}

// Fetch Google Sheet tab
async function fetchTab(tab) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(tab)}?key=${GSHEETS_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GSheets error ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.values || []
}

// Step 1: Import rate catalog from R_bzl-rooms-rates-map
async function importRatesCatalog() {
  console.log("=== Step 1: Import Rates Catalog ===")
  const rows = await fetchTab("R_bzl-rooms-rates-map")
  console.log("Rows fetched:", rows.length)
  
  if (rows.length < 2) { console.log("No data"); return {} }
  
  // Find header row
  const headers = rows[0].map(h => String(h).trim().toUpperCase())
  console.log("Headers:", headers.join(", "))
  
  const idx = (name) => headers.indexOf(name)
  const roomTypeMap = await getRoomTypeMap()
  console.log("Room type lookup:", Object.keys(roomTypeMap).length, "entries")
  
  // Group by RATE-ID
  const rateMap = {}
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const rateId = String(row[idx("RATE-ID")] || "").trim()
    if (!rateId) continue
    
    const roomId = String(row[idx("ROOM-ID")] || "").trim()
    const rateName = String(row[idx("RATE-NAME")] || "").trim()
    const rateCode = String(row[idx("RATE-CODE")] || "").trim()
    const pax = parseInt(String(row[idx("RATE-PAX")] || "2").replace(/[^0-9]/g, ""), 10) || 2
    const notRefundable = ["Y", "YES", "TRUE", "1", "SI"].includes(String(row[idx("NOT-REFUNDABLE")] || "").trim().toUpperCase())
    const rateType = String(row[idx("RATE-TYPE")] || "").trim()
    const basePrice = parseFloat(String(row[idx("BASE-PRICE")] || "0").replace(",", ".")) || 0
    const deleted = ["Y", "YES", "TRUE", "1"].includes(String(row[idx("DELETED")] || "").trim().toUpperCase())
    
    if (!rateMap[rateId]) {
      rateMap[rateId] = { rateId, rateName, rateCode, roomIds: new Set(), pax, notRefundable, rateType, basePrice, deleted }
    }
    
    const rtUuid = roomTypeMap[roomId]
    if (rtUuid) rateMap[rateId].roomIds.add(rtUuid)
  }
  
  console.log("Unique rates found:", Object.keys(rateMap).length)
  
  // Upsert into rates table
  let imported = 0
  const rateIdMap = {} // bedzzle_rate_id -> supabase rate UUID
  
  for (const [rateId, info] of Object.entries(rateMap)) {
    const { error, data } = await supabase.from("rates").upsert({
      hotel_id: HOTEL_ID,
      scidoo_rate_id: rateId,
      code: info.rateCode || rateId,
      name: info.rateName || `Tariffa ${rateId}`,
      room_type_ids: Array.from(info.roomIds),
      arrangements: [{
        type: info.rateType || "BB",
        pax: info.pax,
        not_refundable: info.notRefundable,
        base_price: info.basePrice,
      }],
      is_active: !info.deleted,
      raw_data: { bedzzle_rate_id: rateId, rate_type: info.rateType, pax: info.pax, base_price: info.basePrice },
      updated_at: new Date().toISOString(),
    }, { onConflict: "hotel_id,scidoo_rate_id" }).select("id")
    
    if (error) {
      console.error(`Rate ${rateId} error:`, error.message)
    } else {
      imported++
      if (data?.[0]?.id) rateIdMap[rateId] = data[0].id
    }
  }
  
  console.log("Rates imported:", imported)
  return rateIdMap
}

// Step 2: Import pricing grid from W_bzl-rates
async function importPricingGrid(rateIdMap) {
  console.log("\n=== Step 2: Import Pricing Grid ===")
  const rows = await fetchTab("W_bzl-rates")
  console.log("Rows fetched:", rows.length)
  
  if (rows.length < 8) { console.log("No data"); return }
  
  // Row 0: ROOM_ID:RATE_ID headers
  // Row 3: PAX (e.g. "PAX 2")
  // Row 6+: DATE | prices
  const headerRow = rows[0] || []
  const paxRow = rows[3] || []
  
  const roomTypeMap = await getRoomTypeMap()
  
  // If rateIdMap is incomplete, fetch from DB
  if (Object.keys(rateIdMap).length === 0) {
    const { data: rates } = await supabase.from("rates").select("id, scidoo_rate_id").eq("hotel_id", HOTEL_ID)
    for (const r of rates || []) {
      if (r.scidoo_rate_id) rateIdMap[String(r.scidoo_rate_id)] = r.id
    }
  }
  console.log("Rate ID lookup:", Object.keys(rateIdMap).length, "entries")
  
  // Parse column definitions
  const colDefs = []
  for (let c = 1; c < headerRow.length; c++) {
    const cell = String(headerRow[c] || "").trim()
    if (!cell.includes(":")) continue
    const [roomId, rateId] = cell.split(":")
    if (!roomId || !rateId) continue
    const paxStr = String(paxRow[c] || "2").replace(/[^0-9]/g, "")
    const pax = parseInt(paxStr, 10) || 2
    colDefs.push({ roomId: roomId.trim(), rateId: rateId.trim(), pax, colIdx: c })
  }
  console.log("Column definitions:", colDefs.length, "room:rate combos")
  
  // Cutoff: only dates from 7 days ago
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  
  let imported = 0
  let errors = 0
  let batch = []
  const BATCH_SIZE = 200
  
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i]
    const dateRaw = row[0]
    if (!dateRaw) continue
    
    // Parse date (DD/MM/YYYY or YYYY-MM-DD or serial)
    let date = null
    const s = String(dateRaw).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      date = s
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/")
      date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    } else if (/^\d+$/.test(s)) {
      // Excel serial date
      const epoch = new Date(1899, 11, 30)
      epoch.setDate(epoch.getDate() + parseInt(s, 10))
      date = epoch.toISOString().slice(0, 10)
    }
    
    if (!date || date < cutoffStr) continue
    
    for (const col of colDefs) {
      const priceVal = row[col.colIdx]
      if (priceVal === undefined || priceVal === null || priceVal === "") continue
      const price = parseFloat(String(priceVal).replace(",", "."))
      if (isNaN(price) || price <= 0) continue
      
      const roomTypeId = roomTypeMap[col.roomId]
      const rateId = rateIdMap[col.rateId]
      if (!roomTypeId || !rateId) continue
      
      batch.push({
        hotel_id: HOTEL_ID,
        room_type_id: roomTypeId,
        rate_id: rateId,
        occupancy: col.pax,
        date,
        price,
        is_manual: false,
        updated_at: new Date().toISOString(),
      })
      
      if (batch.length >= BATCH_SIZE) {
        const { error } = await supabase.from("pricing_grid").upsert(batch, {
          onConflict: "hotel_id,room_type_id,rate_id,occupancy,date"
        })
        if (error) { console.error("Batch error:", error.message); errors++ }
        else imported += batch.length
        batch = []
      }
    }
  }
  
  // Flush
  if (batch.length > 0) {
    const { error } = await supabase.from("pricing_grid").upsert(batch, {
      onConflict: "hotel_id,room_type_id,rate_id,occupancy,date"
    })
    if (error) { console.error("Final batch error:", error.message); errors++ }
    else imported += batch.length
  }
  
  console.log("Pricing grid imported:", imported, "records,", errors, "errors")
}

// Run
async function main() {
  console.log("Starting Casanova rates import...")
  const rateIdMap = await importRatesCatalog()
  await importPricingGrid(rateIdMap)
  console.log("\nDone!")
}

main().catch(err => console.error("Fatal error:", err))
