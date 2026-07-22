const SB = "https://aeynirkfixurikshxfov.supabase.co"
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY non configurata")
}
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const HID = "96315c81-9bed-4c2f-b981-da899c0bd04b"

async function run() {
  // Get API key
  const r1 = await fetch(`${SB}/rest/v1/pms_integrations?hotel_id=eq.${HID}&pms_name=eq.scidoo&select=id,api_key`, {
    headers: { apikey: SK, Authorization: `Bearer ${SK}` }
  })
  const pms = (await r1.json())[0]
  console.log("PMS:", pms.id)

  // Fetch bookings year by year
  const all = new Map()
  for (const [f, t] of [["2024-01-01","2024-12-31"],["2025-01-01","2025-12-31"],["2026-01-01","2026-12-31"],["2027-01-01","2027-12-31"]]) {
    console.log(`Fetching ${f} -> ${t}...`)
    const r = await fetch("https://www.scidoo.com/api/v1/bookings/get.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": pms.api_key },
      body: JSON.stringify({ checkin_from: f, checkin_to: t })
    })
    if (r.ok) {
      const j = await r.json()
      const res = j.reservations || []
      console.log(`  ${res.length} bookings`)
      for (const b of res) all.set(String(b.id || b.internal_id), b)
    } else {
      console.log(`  ERROR ${r.status}: ${(await r.text()).substring(0,100)}`)
    }
  }

  // last_modified
  console.log("Fetching last_modified...")
  const rm = await fetch("https://www.scidoo.com/api/v1/bookings/get.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": pms.api_key },
    body: JSON.stringify({ last_modified: true })
  })
  if (rm.ok) {
    const j = await rm.json()
    for (const b of (j.reservations || [])) all.set(String(b.id || b.internal_id), b)
    console.log(`  ${j.reservations?.length || 0} modified`)
  }

  console.log(`\nTotal unique: ${all.size}`)

  // Map and upsert
  const recs = []
  for (const [, b] of all) {
    if (!b.checkin_date || b.checkin_date === "0000-00-00") continue
    let co = b.checkout_date
    if (!co || co === "0000-00-00") { const d = new Date(b.checkin_date); d.setDate(d.getDate()+1); co = d.toISOString().slice(0,10) }
    let ta = 0
    if (b.daily_price && typeof b.daily_price === "object" && !Array.isArray(b.daily_price))
      ta = Object.values(b.daily_price).reduce((s,v) => s + (parseFloat(v)||0), 0)
    if (!ta && b.total_amount) ta = parseFloat(b.total_amount)

    recs.push({
      hotel_id: HID, pms_integration_id: pms.id,
      scidoo_booking_id: String(b.id||b.internal_id),
      raw_data: b, checkin_date: b.checkin_date, checkout_date: co,
      total_amount: ta || null, status: b.status || "sconosciuto",
      room_type_code: b.room_type_id ? String(b.room_type_id) : null,
      channel: b.agency?.name || "Direct",
      booking_date: b.creation || null, synced_at: new Date().toISOString(),
    })
  }
  console.log(`Records: ${recs.length}`)

  // Upsert batches
  let ok = 0
  for (let i = 0; i < recs.length; i += 50) {
    const batch = recs.slice(i, i + 50)
    const r = await fetch(`${SB}/rest/v1/scidoo_raw_bookings?on_conflict=hotel_id,scidoo_booking_id`, {
      method: "POST",
      headers: { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch)
    })
    if (r.ok) { ok += batch.length } else { console.log(`Batch err: ${(await r.text()).substring(0,200)}`) }
  }
  console.log(`Upserted: ${ok}`)

  // Verify
  for (const y of [2025, 2026]) {
    const r = await fetch(`${SB}/rest/v1/scidoo_raw_bookings?hotel_id=eq.${HID}&status=neq.annullata&checkin_date=gte.${y}-01-01&checkin_date=lte.${y}-12-31&select=total_amount`, {
      headers: { apikey: SK, Authorization: `Bearer ${SK}` }
    })
    const rows = await r.json()
    const sum = rows.reduce((s,b) => s + (parseFloat(b.total_amount)||0), 0)
    console.log(`${y}: ${rows.length} bookings, EUR ${sum.toFixed(2)}`)
  }
}
run().catch(console.error)
