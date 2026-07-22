/**
 * Verifica UNICA: le versioni multiple di id=28581 e id=28255
 * nell'API Scidoo hanno internal_id distinti o identici?
 *
 * Chiama /bookings/get.php stay_from=2026-04-01 stay_to=2026-04-30
 * Filtra per id IN (28255, 28581)
 * Mostra per ciascuna occorrenza: id | internal_id | status | cancellation | room_id
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aeynirkfixurikshxfov.supabase.co'
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HOTEL_ID = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca'

async function getCredentials() {
  const { data, error } = await supabase
    .from('pms_integrations')
    .select('api_key, property_id')
    .eq('hotel_id', HOTEL_ID)
    .eq('pms_name', 'scidoo')
    .single()
  if (error) throw new Error(`DB error: ${error.message}`)
  return data
}

async function fetchBookings(apiKey, propertyId, params) {
  const body = { property_id: propertyId, ...params }
  const res = await fetch('https://www.scidoo.com/api/v1/bookings/get.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`)
  }
}

async function main() {
  const { api_key, property_id } = await getCredentials()
  console.log(`[credentials] property_id=${property_id}`)

  const TARGET_IDS = ['28255', '28581']

  // Fetch stay aprile completo
  const data = await fetchBookings(api_key, property_id, {
    stay_from: '2026-04-01',
    stay_to: '2026-04-30',
  })

  const reservations = data?.reservations ?? data?.bookings ?? data?.data ?? []
  console.log(`[fetch] Totale record ricevuti: ${reservations.length}`)

  // Filtra per id target
  const targets = reservations.filter(b => TARGET_IDS.includes(String(b.id)))
  console.log(`[fetch] Occorrenze trovate per id IN (28255, 28581): ${targets.length}\n`)

  // Header tabella
  console.log('occurrence | id     | internal_id | status             | cancellation        | room_id (list_dates_room[0])')
  console.log('-----------+--------+-------------+--------------------+---------------------+-----------------------------')

  let i = 1
  for (const b of targets) {
    const roomId = b.list_dates_room?.[0]?.room_id ?? 'n/a'
    const cancel = b.cancellation ?? 'null'
    const internalId = b.internal_id ?? 'MISSING'
    console.log(
      `${String(i).padEnd(10)} | ${String(b.id).padEnd(6)} | ${String(internalId).padEnd(11)} | ${String(b.status).padEnd(18)} | ${String(cancel).padEnd(19)} | ${roomId}`
    )
    i++
  }

  // Log dei campi raw per la prima occorrenza di ciascun id target
  console.log('\n--- RAW PAYLOAD (tutti i campi top-level) ---')
  for (const targetId of TARGET_IDS) {
    const occurrences = targets.filter(b => String(b.id) === targetId)
    console.log(`\n[id=${targetId}] ${occurrences.length} occorrenze nel payload:`)
    for (const [idx, b] of occurrences.entries()) {
      const keys = Object.keys(b).sort()
      console.log(`  [versione ${idx + 1}]`)
      for (const k of keys) {
        // Mostra solo campi scalari e identificativi (evita dump enormi)
        const val = b[k]
        if (typeof val === 'object' && val !== null) {
          if (Array.isArray(val)) {
            console.log(`    ${k}: [array len=${val.length}] ${JSON.stringify(val).slice(0, 120)}`)
          } else {
            console.log(`    ${k}: ${JSON.stringify(val).slice(0, 120)}`)
          }
        } else {
          console.log(`    ${k}: ${val}`)
        }
      }
    }
  }
}

main().catch(e => {
  console.error('[ERROR]', e.message)
  process.exit(1)
})
