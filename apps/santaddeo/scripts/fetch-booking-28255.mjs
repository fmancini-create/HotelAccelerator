/**
 * Fetch diretto a Scidoo per il booking 28255
 * Verifica VERIFICA 1: qual è il raw_status nel PMS live?
 */

const SCIDOO_API_BASE = "https://www.scidoo.com/api/v1"
const API_KEY = "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y="
const PROPERTY_ID = 1131
const BOOKING_ID = 28255

async function fetchBooking(bookingId) {
  // Scidoo /bookings/get.php con id specifico
  // La API supporta stay_from/stay_to per filtrare soggiorni attivi
  // Proviamo con modified_from per prendere recenti, e poi filtriamo per id
  const payload = {
    stay_from: "2026-04-14",
    stay_to: "2026-04-17",
    property_id: PROPERTY_ID,
  }

  console.log(`\nFetch 1: stay_from=2026-04-14 stay_to=2026-04-17`)
  const r1 = await fetch(`${SCIDOO_API_BASE}/bookings/get.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": API_KEY },
    body: JSON.stringify(payload),
  })
  const d1 = await r1.json()
  const target = (d1?.reservations || []).find(b => String(b.id) === String(bookingId))

  if (target) {
    console.log(`\n=== BOOKING ${bookingId} TROVATO nel fetch stay 14-17 apr ===`)
    console.log(`  status:            ${target.status}`)
    console.log(`  cancellation:      ${target.cancellation || "(null)"}`)
    console.log(`  last_modification: ${target.last_modification || "(null)"}`)
    console.log(`  room_type_id:      ${target.room_type_id}`)
    console.log(`  room_type_name:    ${target.room_type_name || target.room_type}`)
    console.log(`  list_dates_room:   ${JSON.stringify(target.list_dates_room)}`)
    console.log(`  daily_price:       ${JSON.stringify(target.daily_price)}`)
    console.log(`  customer:          ${target.customer?.name || "(no name)"}`)
    console.log(`\n  CONCLUSIONE VERIFICA 1:`)
    if (target.status === "annullata") {
      console.log(`  Il booking 28255 e ANNULLATA anche nel PMS live.`)
      console.log(`  Il trigger NON ha bloccato nulla. Il PMS lo include nel`)
      console.log(`  report perche la cancellazione e avvenuta durante il soggiorno.`)
    } else {
      console.log(`  ATTENZIONE: Il booking 28255 ha status="${target.status}" nel PMS!`)
      console.log(`  Il trigger sta bloccando la riattivazione nel DB.`)
      console.log(`  Il trigger va rimosso IMMEDIATAMENTE.`)
    }
    return
  }

  console.log(`  Booking ${bookingId} non trovato nel fetch stay 14-17 apr.`)
  console.log(`  Totale reservations nel payload: ${d1?.reservations?.length || 0}`)

  // Secondo fetch: cerca per modified_from recente
  console.log(`\nFetch 2: modified_from=2026-04-12 (data cancellazione)`)
  const payload2 = {
    modified_from: "2026-04-12",
    property_id: PROPERTY_ID,
  }
  const r2 = await fetch(`${SCIDOO_API_BASE}/bookings/get.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": API_KEY },
    body: JSON.stringify(payload2),
  })
  const d2 = await r2.json()
  const target2 = (d2?.reservations || []).find(b => String(b.id) === String(bookingId))

  if (target2) {
    console.log(`\n=== BOOKING ${bookingId} TROVATO nel fetch modified_from 12 apr ===`)
    console.log(`  status:            ${target2.status}`)
    console.log(`  cancellation:      ${target2.cancellation || "(null)"}`)
    console.log(`  last_modification: ${target2.last_modification || "(null)"}`)
    console.log(`  room_type_id:      ${target2.room_type_id}`)
    console.log(`  list_dates_room:   ${JSON.stringify(target2.list_dates_room)}`)
    console.log(`  daily_price:       ${JSON.stringify(target2.daily_price)}`)
    console.log(`\n  CONCLUSIONE VERIFICA 1:`)
    if (target2.status === "annullata") {
      console.log(`  ANNULLATA anche nel PMS live. Trigger OK.`)
    } else {
      console.log(`  STATUS="${target2.status}" nel PMS! TRIGGER sta bloccando riattivazione.`)
    }
  } else {
    console.log(`  Booking ${bookingId} non trovato nemmeno con modified_from.`)
    console.log(`  Totale reservations: ${d2?.reservations?.length || 0}`)
    console.log(`  Questo indica che il booking potrebbe non esistere piu nel PMS`)
    console.log(`  oppure e in uno stato che non viene restituito dall'API.`)
  }

  // Terzo fetch: stay esteso
  console.log(`\nFetch 3: stay_from=2026-04-01 stay_to=2026-04-30 (mese intero)`)
  const payload3 = {
    stay_from: "2026-04-01",
    stay_to: "2026-04-30",
    property_id: PROPERTY_ID,
  }
  const r3 = await fetch(`${SCIDOO_API_BASE}/bookings/get.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": API_KEY },
    body: JSON.stringify(payload3),
  })
  const d3 = await r3.json()
  const allIds = (d3?.reservations || []).map(b => b.id)
  const target3 = (d3?.reservations || []).find(b => String(b.id) === String(bookingId))
  
  console.log(`  Totale reservations Aprile: ${d3?.reservations?.length || 0}`)
  console.log(`  ID 28255 presente: ${target3 ? "SI" : "NO"}`)
  
  if (target3) {
    console.log(`  status:         ${target3.status}`)
    console.log(`  cancellation:   ${target3.cancellation || "(null)"}`)
    console.log(`  room_type_id:   ${target3.room_type_id}`)
    console.log(`  list_dates_room:${JSON.stringify(target3.list_dates_room)}`)
    if (target3.status !== "annullata") {
      console.log(`\n  *** IL TRIGGER STA BLOCCANDO UNA RIATTIVAZIONE LEGITTIMA ***`)
    } else {
      console.log(`\n  Confermato ANNULLATA nel PMS. Trigger corretto.`)
    }
  }

  // Mostra i primi 5 booking attivi di Aprile per sanity check
  console.log(`\nPrimi 5 booking attivi Aprile (sanity check):`)
  const active = (d3?.reservations || []).filter(b => b.status !== "annullata").slice(0, 5)
  for (const b of active) {
    console.log(`  id=${b.id} status=${b.status} ci=${b.checkin} co=${b.checkout} rt=${b.room_type_id}`)
  }
}

fetchBooking(BOOKING_ID).catch(console.error)
