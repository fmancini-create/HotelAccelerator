// Verifica A: i tre record di 28581 nell'API hanno internal_id diversi?
// Interroga /bookings/get.php con stay_from=2026-04-01/stay_to=2026-04-30
// e stampa tutti i record per booking_id 28255 e 28581
// mostrando id, internal_id, status, cancellation, room_id

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://aeynirkfixurikshxfov.supabase.co'
const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Leggi credenziali
const { data: integration } = await supabase
  .from('pms_integrations')
  .select('api_key, property_id')
  .eq('hotel_id', '8dd3f8c1-284a-43f1-b24f-e6a9d428edca')
  .eq('pms_name', 'scidoo')
  .single()

if (!integration) {
  console.error('No integration found')
  process.exit(1)
}

const { api_key, property_id } = integration
const BASE_URL = 'https://www.scidoo.com/api/v1'

async function fetchBookings(params) {
  const body = new URLSearchParams({ property_id, ...params })
  const res = await fetch(`${BASE_URL}/bookings/get.php`, {
    method: 'POST',
    headers: {
      'Api-Key': api_key,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    console.error('Non-JSON response:', text.slice(0, 200))
    return null
  }
}

// Fetch con range ampio per catturare tutte le versioni
const result = await fetchBookings({
  stay_from: '2026-04-01',
  stay_to: '2026-04-30',
})

if (!result?.reservations) {
  console.error('No reservations in response')
  process.exit(1)
}

const reservations = result.reservations
console.log(`\nTotale record nell'API: ${reservations.length}`)

// VERIFICA A: tutti i record per 28255 e 28581
const TARGET_IDS = ['28255', '28581']

for (const targetId of TARGET_IDS) {
  const versions = reservations.filter(r => String(r.id) === targetId)
  console.log(`\n========== booking id=${targetId}: ${versions.length} version(i) ==========`)
  for (const v of versions) {
    console.log({
      id: v.id,
      internal_id: v.internal_id,
      status: v.status,
      cancellation: v.cancellation || null,
      room_id: v.list_dates_room?.[0]?.room_id ?? 'N/A',
      room_type_id: v.room_type_id,
      last_modification: v.last_modification,
      checkin: v.checkin,
      checkout: v.checkout,
      guest_email: v.customer?.email,
    })
  }
}

// VERIFICA A complementare: c'è qualche booking_id per cui l'API
// restituisce più versioni con internal_id DIVERSI?
const byBookingId = new Map()
for (const r of reservations) {
  const key = String(r.id)
  if (!byBookingId.has(key)) byBookingId.set(key, [])
  byBookingId.get(key).push(r)
}

let multiVersionCount = 0
let multiInternalIdCount = 0
const multiInternalIdExamples = []

for (const [bookingId, versions] of byBookingId.entries()) {
  if (versions.length > 1) {
    multiVersionCount++
    const internalIds = [...new Set(versions.map(v => String(v.internal_id)))]
    if (internalIds.length > 1) {
      multiInternalIdCount++
      multiInternalIdExamples.push({
        booking_id: bookingId,
        internal_ids: internalIds,
        statuses: versions.map(v => v.status),
        cancellations: versions.map(v => v.cancellation || null),
        room_ids: versions.map(v => v.list_dates_room?.[0]?.room_id),
      })
    }
  }
}

console.log(`\n========== STATISTICHE ==========`)
console.log(`Booking_id con più versioni nell'API: ${multiVersionCount}`)
console.log(`Di cui con internal_id DIVERSI: ${multiInternalIdCount}`)

if (multiInternalIdExamples.length > 0) {
  console.log(`\nEsempi con internal_id diversi:`)
  for (const ex of multiInternalIdExamples.slice(0, 10)) {
    console.log(ex)
  }
} else {
  console.log(`\nNessun booking_id ha internal_id diversi tra le versioni.`)
  console.log(`=> Tutte le versioni dello stesso booking_id condividono lo stesso internal_id.`)
}

// VERIFICA: campiona 5 booking random per vedere la struttura di internal_id
console.log(`\n========== CAMPIONE 5 RECORD RANDOM ==========`)
const sample = reservations.slice(0, 5)
for (const r of sample) {
  console.log({
    id: r.id,
    internal_id: r.internal_id,
    status: r.status,
  })
}
