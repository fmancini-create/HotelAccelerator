/**
 * STEP 4 — Backfill zombie bookings (Option B)
 *
 * Finestra: checkout_date >= 2026-04-17 AND checkout_date <= 2026-12-31
 *
 * Strategia:
 *   1. Carica dal DB tutti i candidati (status=annullata in quella finestra),
 *      memorizzando scidoo_booking_id e internal_id correnti.
 *   2. Effettua 9 chiamate API batch (una per mese di check-in), usando stay_from/to
 *      sul range mensile esteso (per catturare soggiorni cross-month).
 *   3. Per ogni booking_id candidato, accumula tutte le versioni ricevute dall'API.
 *   4. Seleziona la versione con max internal_id tra tutte quelle ricevute.
 *   5. Se max internal_id > DB internal_id → upsert del raw_data e status aggiornati.
 *
 * Non modifica il codice del sync service, opera solo sulla tabella scidoo_raw_bookings.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aeynirkfixurikshxfov.supabase.co'
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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
    headers: { 'Content-Type': 'application/json', 'Api-Key': apiKey },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { throw new Error(`Non-JSON: ${text.slice(0, 200)}`) }
}

function parseIntSafe(v) {
  const n = parseInt(String(v ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

async function loadCandidates() {
  const all = []
  const pageSize = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('scidoo_raw_bookings')
      .select('id, scidoo_booking_id, status, raw_data, checkin_date, checkout_date')
      .eq('hotel_id', HOTEL_ID)
      .eq('status', 'annullata')
      .gte('checkout_date', '2026-04-17')
      .lte('checkout_date', '2026-12-31')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`load candidates: ${error.message}`)
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

async function main() {
  console.log('[backfill] Starting zombie backfill — Option B')
  const { api_key, property_id } = await getCredentials()
  console.log(`[backfill] property_id=${property_id}`)

  // 1. Candidati DB
  const candidates = await loadCandidates()
  console.log(`[backfill] Candidati (status=annullata, checkout 2026-04-17..2026-12-31): ${candidates.length}`)
  const candidateIds = new Set(candidates.map((c) => String(c.scidoo_booking_id)))
  const dbByBookingId = new Map(candidates.map((c) => [String(c.scidoo_booking_id), c]))

  // 2. 9 chiamate API mensili (aprile 2026 .. dicembre 2026) — stay_from/to sul mese
  const months = [
    ['2026-04-01', '2026-04-30'],
    ['2026-05-01', '2026-05-31'],
    ['2026-06-01', '2026-06-30'],
    ['2026-07-01', '2026-07-31'],
    ['2026-08-01', '2026-08-31'],
    ['2026-09-01', '2026-09-30'],
    ['2026-10-01', '2026-10-31'],
    ['2026-11-01', '2026-11-30'],
    ['2026-12-01', '2026-12-31'],
  ]

  // 3. Accumula per booking_id la versione con max internal_id ricevuta
  const bestByBookingId = new Map() // booking_id → { booking, internalId }

  for (const [stay_from, stay_to] of months) {
    const result = await fetchBookings(api_key, property_id, { stay_from, stay_to })
    const reservations = result?.reservations ?? result?.bookings ?? result?.data ?? []
    let hits = 0
    for (const b of reservations) {
      const bid = String(b.id || b.internal_id)
      if (!candidateIds.has(bid)) continue
      hits++
      const iid = parseIntSafe(b.internal_id)
      const existing = bestByBookingId.get(bid)
      if (!existing || iid > existing.internalId) {
        bestByBookingId.set(bid, { booking: b, internalId: iid })
      }
    }
    console.log(`[backfill] Month ${stay_from}..${stay_to}: API=${reservations.length}, matched_candidates=${hits}`)
  }

  // 4. Confronto con DB e upsert dove max internal_id API > DB internal_id
  let toUpdate = 0
  let notFound = 0
  let alreadyBest = 0
  let updated = 0
  let failures = 0

  for (const [bid, dbRec] of dbByBookingId) {
    const best = bestByBookingId.get(bid)
    if (!best) { notFound++; continue }
    const dbIid = parseIntSafe(dbRec.raw_data?.internal_id)
    if (best.internalId <= dbIid) { alreadyBest++; continue }
    toUpdate++
    const newBooking = best.booking
    const newStatus = newBooking.status ?? 'confermata'
    const newRaw = newBooking // sostituisce interamente raw_data con la versione attiva
    // Ricalcola checkin/checkout dal nuovo payload (possibile diverso se list_dates_room diverso)
    const dates = (newBooking.list_dates_room || [])
      .map((d) => ({ from: d.from, to: d.to }))
      .filter((d) => d.from && d.to)
    const newCheckin = dates.length ? dates.map(d => d.from).sort()[0] : dbRec.checkin_date
    const newCheckout = dates.length ? dates.map(d => d.to).sort().slice(-1)[0] : dbRec.checkout_date

    // Recupera nome room_type dal mapping nel DB
    const firstRoomId = newBooking.list_dates_room?.[0]?.room_id
    let roomTypeName = null
    if (firstRoomId && firstRoomId !== 0 && firstRoomId !== '0') {
      const { data: rt } = await supabase
        .from('scidoo_rooms_mapping')
        .select('room_type_name')
        .eq('hotel_id', HOTEL_ID)
        .eq('scidoo_room_id', String(firstRoomId))
        .maybeSingle()
      roomTypeName = rt?.room_type_name ?? null
    }

    const { error } = await supabase
      .from('scidoo_raw_bookings')
      .update({
        status: newStatus,
        raw_data: newRaw,
        checkin_date: newCheckin,
        checkout_date: newCheckout,
        room_type_name: roomTypeName,
        synced_at: new Date().toISOString(),
      })
      .eq('id', dbRec.id)

    if (error) {
      failures++
      console.error(`[backfill] FAIL id=${bid}: ${error.message}`)
    } else {
      updated++
      console.log(`[backfill] OK id=${bid} | iid ${dbIid} → ${best.internalId} | status annullata → ${newStatus} | room_id ${firstRoomId}`)
    }
  }

  console.log('\n=== BACKFILL SUMMARY ===')
  console.log(`Candidati DB:                              ${candidates.length}`)
  console.log(`Trovati nell'API (almeno 1 versione):      ${candidates.length - notFound}`)
  console.log(`Non trovati nell'API:                      ${notFound}`)
  console.log(`DB già ha la versione migliore:            ${alreadyBest}`)
  console.log(`Da aggiornare (max API iid > DB iid):      ${toUpdate}`)
  console.log(`Aggiornati con successo:                   ${updated}`)
  console.log(`Fallimenti:                                ${failures}`)
  console.log(`\n>>> ZOMBIE CORRETTI TOTALI: ${updated} <<<`)
}

main().catch((e) => { console.error('[ERROR]', e); process.exit(1) })
