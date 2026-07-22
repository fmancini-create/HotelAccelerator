#!/usr/bin/env node
/**
 * PRE-CHECK: conteggio booking attivi DB vs API Scidoo per Gennaio 2026.
 *
 * Per ogni booking presente nel DB con status!=annullata e soggiorno a Gennaio,
 * verifica se esiste nell'API Scidoo restituita da stay_from/to di Gennaio.
 *
 * OUTPUT:
 *  - DB non-cancelled count
 *  - API non-cancelled count (deduped by max internal_id)
 *  - Pure ghosts (in DB, NOT returned by API at all)
 *  - DB-active but API-cancelled or missing
 *  - Revenue fantasma di Gennaio per ciascuna categoria
 *  - Top 30 fantasmi per revenue
 *  - Inverso: API-active ma non in DB
 *
 * NESSUNA modifica al DB o al PMS. Solo lettura.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aeynirkfixurikshxfov.supabase.co'
const HOTEL_ID = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca'
const STAY_FROM = '2026-01-01'
const STAY_TO = '2026-01-31'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// 1) Credenziali Scidoo dal DB
const { data: integ, error: integErr } = await supabase
  .from('pms_integrations')
  .select('api_key, property_id')
  .eq('hotel_id', HOTEL_ID)
  .eq('pms_name', 'scidoo')
  .single()
if (integErr || !integ) {
  console.error('[DB] Scidoo integration not found:', integErr)
  process.exit(1)
}
console.log(`[DB] property_id=${integ.property_id}`)

// 2) DB side
console.log(`[DB] Fetching non-cancelled bookings checkin<=${STAY_TO} AND checkout>=${STAY_FROM}`)
const { data: dbBookings, error: dbErr } = await supabase
  .from('scidoo_raw_bookings')
  .select('scidoo_booking_id,status,checkin_date,checkout_date,room_type_name,raw_data')
  .eq('hotel_id', HOTEL_ID)
  .neq('status', 'annullata')
  .lte('checkin_date', STAY_TO)
  .gte('checkout_date', STAY_FROM)
if (dbErr) {
  console.error('[DB] query failed:', dbErr)
  process.exit(1)
}
console.log(`[DB] non-cancelled bookings in Jan 2026: ${dbBookings.length}`)

// 3) API side
console.log(`[API] POST /bookings/get.php stay_from=${STAY_FROM} stay_to=${STAY_TO}`)
const res = await fetch('https://www.scidoo.com/api/v1/bookings/get.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Api-Key': integ.api_key,
  },
  body: JSON.stringify({
    property_id: integ.property_id,
    stay_from: STAY_FROM,
    stay_to: STAY_TO,
  }),
})
const text = await res.text()
let payload
try {
  payload = JSON.parse(text)
} catch {
  console.error('[API] Non-JSON response:', text.slice(0, 400))
  process.exit(1)
}
const apiAll =
  payload?.reservations || payload?.bookings || payload?.data || []
console.log(`[API] total records received: ${apiAll.length}`)

// Dedup by max internal_id (stessa regola della sync)
const apiByKey = new Map()
for (const b of apiAll) {
  const key = String(b.id || b.internal_id)
  const iid = parseInt(String(b.internal_id || '0'), 10)
  const existing = apiByKey.get(key)
  if (!existing || iid > parseInt(String(existing.internal_id || '0'), 10)) {
    apiByKey.set(key, b)
  }
}
const apiDedup = Array.from(apiByKey.values())
const apiActive = apiDedup.filter((b) => b.status && b.status !== 'annullata')

console.log(`[API] deduped unique booking_ids: ${apiDedup.length}`)
console.log(`[API] non-cancelled unique booking_ids: ${apiActive.length}`)

const apiStatusCount = {}
for (const b of apiDedup) apiStatusCount[b.status] = (apiStatusCount[b.status] || 0) + 1
console.log(`[API] status breakdown:`, apiStatusCount)

// 4) Confronto insiemistico
const dbIds = new Set(dbBookings.map((b) => String(b.scidoo_booking_id)))
const apiAnyIds = new Set(apiDedup.map((b) => String(b.id)))
const apiActiveIds = new Set(apiActive.map((b) => String(b.id)))

const ghostPure = dbBookings.filter((b) => !apiAnyIds.has(String(b.scidoo_booking_id)))
const ghostActiveDbOnly = dbBookings.filter((b) => !apiActiveIds.has(String(b.scidoo_booking_id)))

// 5) Revenue fantasma per Gennaio
function januaryRevenue(b) {
  const dp = b.raw_data?.daily_price
  if (!dp || typeof dp !== 'object' || Array.isArray(dp)) return 0
  let gross = 0
  let dpTotal = 0
  for (const [k, v] of Object.entries(dp)) {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0 || n === 999 || n === 9999) continue
    dpTotal += n
    let d
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) d = k
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(k)) {
      const [dd, mm, yyyy] = k.split('/')
      d = `${yyyy}-${mm}-${dd}`
    } else continue
    if (d >= '2026-01-01' && d <= '2026-01-31') gross += n
  }
  let discount = 0
  const extras = b.raw_data?.extras || []
  for (const ex of extras) {
    const p = Number(ex.price)
    if (!Number.isFinite(p) || p >= 0) continue
    const cat = String(ex.category || '').toLowerCase()
    const desc = String(ex.description || '').toLowerCase()
    if (
      cat.includes('sconti') ||
      cat.includes('servizio nota') ||
      desc.includes('sconto') ||
      desc.includes('addebito libero')
    ) {
      discount += p
    }
  }
  const net = dpTotal > 0 ? gross + (gross / dpTotal) * discount : gross
  return net
}

const ghostPureRev = ghostPure.reduce((s, b) => s + januaryRevenue(b), 0)
const ghostActiveRev = ghostActiveDbOnly.reduce((s, b) => s + januaryRevenue(b), 0)

console.log('')
console.log('=== SUMMARY ===')
console.log(`DB non-cancelled:        ${dbBookings.length}`)
console.log(`API non-cancelled:       ${apiActive.length}`)
console.log(`Delta (DB - API active): ${dbBookings.length - apiActive.length}`)
console.log(`Pure ghosts (DB ∉ API):  ${ghostPure.length}`)
console.log(`DB-active but API-cancelled/missing: ${ghostActiveDbOnly.length}`)

console.log('')
console.log('=== REVENUE IMPACT (Gennaio 2026) ===')
console.log(`Pure ghosts revenue:                         ${ghostPureRev.toFixed(2)} €`)
console.log(`DB-active / API-cancelled or missing revenue: ${ghostActiveRev.toFixed(2)} €`)

// 6) Dettaglio top 30 ghosts
if (ghostPure.length > 0) {
  console.log('')
  console.log('=== TOP 30 PURE GHOSTS (DB ma non API) ===')
  const enriched = ghostPure
    .map((b) => ({
      id: b.scidoo_booking_id,
      status: b.status,
      rt: b.room_type_name,
      checkin: b.checkin_date,
      checkout: b.checkout_date,
      rev: januaryRevenue(b),
    }))
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 30)
  for (const e of enriched) {
    console.log(
      `  ${e.id.padEnd(7)} | ${String(e.status).padEnd(10)} | ${(e.rt || '-').padEnd(26)} | ${e.checkin} → ${e.checkout} | ${e.rev.toFixed(2)} €`,
    )
  }
}

// 7) Dettaglio DB-active ma API-cancelled/missing (top 30 per revenue, esclusi i pure ghost)
const pureGhostIds = new Set(ghostPure.map((b) => String(b.scidoo_booking_id)))
const activeButCancelledInApi = ghostActiveDbOnly.filter(
  (b) => !pureGhostIds.has(String(b.scidoo_booking_id)),
)
if (activeButCancelledInApi.length > 0) {
  console.log('')
  console.log('=== TOP 30 DB-ACTIVE / API-CANCELLED ===')
  const enriched = activeButCancelledInApi
    .map((b) => {
      const apiRec = apiByKey.get(String(b.scidoo_booking_id))
      return {
        id: b.scidoo_booking_id,
        db_status: b.status,
        api_status: apiRec?.status || '?',
        rt: b.room_type_name,
        checkin: b.checkin_date,
        checkout: b.checkout_date,
        rev: januaryRevenue(b),
      }
    })
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 30)
  for (const e of enriched) {
    console.log(
      `  ${e.id.padEnd(7)} | db=${String(e.db_status).padEnd(10)} api=${String(e.api_status).padEnd(10)} | ${(e.rt || '-').padEnd(26)} | ${e.checkin} → ${e.checkout} | ${e.rev.toFixed(2)} €`,
    )
  }
}

// 8) Inverso: API-active ma non in DB
const apiNotInDb = apiActive.filter((b) => !dbIds.has(String(b.id)))
console.log('')
console.log(`=== API-ACTIVE but NOT in DB: ${apiNotInDb.length} ===`)
for (const b of apiNotInDb.slice(0, 10)) {
  console.log(`  ${b.id} | ${b.status} | ${b.checkin_date} → ${b.checkout_date}`)
}
