/**
 * Fetch diretto all'API Scidoo — endpoint produzione giornaliera + bookings specifici
 * Obiettivo:
 *   A. Conferma che i fetch sono HTTP reali (stampa URL completo)
 *   B. /production/day (o endpoint equivalente) per 2026-04-16
 *      -> cerca camera 15 (Economy 128.79) e camera 2 (Suite AP 352.92)
 *   C. /bookings/get.php per booking 28255 e 28581
 *      -> confronta status restituito dall'API vs raw_data nel DB
 *
 * I booking candidati zombie dal backup:
 *   28255 Economy         cancellation=2026-04-12  dp_apr16=128.79
 *   28581 Suite AP        cancellation=2026-01-19  dp_apr16=352.92
 *
 * Se l'API restituisce status != annullata per questi booking,
 * il FIX 1 ha creato zombie reali e il trigger va disabilitato.
 */

const SCIDOO_BASE = "https://www.scidoo.com/api/v1"
const API_KEY = "DcwlE61mB7RKvzbtKpqgxntN0IZlQBWflp3ZstRSU0Y="
const PROPERTY_ID = 1131

async function scidooPost(path, body) {
  const url = `${SCIDOO_BASE}${path}`
  console.log(`\n[HTTP] POST ${url}`)
  console.log(`[HTTP] Body: ${JSON.stringify(body)}`)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": API_KEY,
    },
    body: JSON.stringify({ ...body, property_id: PROPERTY_ID }),
  })
  const text = await res.text()
  console.log(`[HTTP] Status: ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    console.log(`[HTTP] Raw response (non-JSON): ${text.slice(0, 500)}`)
    return null
  }
}

async function main() {
  console.log("=".repeat(60))
  console.log("FETCH DIRETTO SCIDOO — production day 2026-04-16")
  console.log("=".repeat(60))

  // ─── STEP 1: scopri gli endpoint disponibili con una chiamata di test ───
  // Proviamo i path più comuni per la produzione giornaliera di Scidoo
  const productionEndpoints = [
    "/production/daily.php",
    "/production/day.php",
    "/production/get.php",
    "/reports/production.php",
    "/bookings/production.php",
    "/occupancy/daily.php",
    "/rooms/production.php",
  ]

  let productionData = null
  let productionEndpointFound = null

  for (const ep of productionEndpoints) {
    try {
      const d = await scidooPost(ep, {
        date: "2026-04-16",
        from: "2026-04-16",
        to: "2026-04-16",
        stay_from: "2026-04-16",
        stay_to: "2026-04-16",
      })
      if (d && !d.error && d !== null) {
        console.log(`\n[OK] Endpoint funzionante: ${ep}`)
        console.log(`[OK] Chiavi risposta: ${Object.keys(d).join(", ")}`)
        productionData = d
        productionEndpointFound = ep
        break
      } else {
        console.log(`[SKIP] ${ep} -> ${JSON.stringify(d)?.slice(0, 80)}`)
      }
    } catch (e) {
      console.log(`[ERROR] ${ep} -> ${e.message}`)
    }
  }

  // ─── STEP 2: fetch bookings per il 16 aprile con stay filter ───
  console.log("\n" + "=".repeat(60))
  console.log("STEP 2: bookings/get.php stay 14-17 aprile")
  console.log("=".repeat(60))

  const bookingsData = await scidooPost("/bookings/get.php", {
    stay_from: "2026-04-14",
    stay_to: "2026-04-17",
  })

  const reservations = bookingsData?.reservations || bookingsData?.bookings || []
  console.log(`\nTotale prenotazioni restituite: ${reservations.length}`)

  // Cerca i candidati zombie
  const zombieCandidates = ["28255", "28581", "30447"]
  for (const id of zombieCandidates) {
    const bk = reservations.find((b) => String(b.id) === id)
    if (bk) {
      console.log(`\n--- Booking ${id} ---`)
      console.log(`  status:            ${bk.status}`)
      console.log(`  cancellation:      ${bk.cancellation || "(null)"}`)
      console.log(`  last_modification: ${bk.last_modification || "(null)"}`)
      console.log(`  room_type_id:      ${bk.room_type_id}`)
      console.log(`  room_type_name:    ${bk.room_type_name || bk.room_type || "(null)"}`)
      console.log(`  checkin:           ${bk.checkin_date || bk.checkin}`)
      console.log(`  checkout:          ${bk.checkout_date || bk.checkout}`)
      console.log(`  list_dates_room:   ${JSON.stringify(bk.list_dates_room)}`)
      console.log(`  daily_price['2026-04-16']: ${bk.daily_price?.["2026-04-16"] ?? "(assente)"}`)
      console.log(`  customer:          ${bk.customer?.name || bk.guest_name || "(no name)"}`)
    } else {
      console.log(`\n--- Booking ${id}: NON trovato nel fetch stay 14-17 ---`)
    }
  }

  // ─── STEP 3: fetch con modified_from per 28581 (cancellato a Gennaio) ───
  console.log("\n" + "=".repeat(60))
  console.log("STEP 3: bookings 28581 via modified_from=2026-04-01")
  console.log("=".repeat(60))

  const modData = await scidooPost("/bookings/get.php", {
    modified_from: "2026-04-01",
  })
  const modRes = modData?.reservations || modData?.bookings || []
  console.log(`Totale prenotazioni modified_from apr: ${modRes.length}`)
  const bk581 = modRes.find((b) => String(b.id) === "28581")
  if (bk581) {
    console.log(`\n28581 TROVATO in modified_from:`)
    console.log(`  status:       ${bk581.status}`)
    console.log(`  cancellation: ${bk581.cancellation || "(null)"}`)
    console.log(`  room_type_id: ${bk581.room_type_id}`)
    console.log(`  list_dates_room: ${JSON.stringify(bk581.list_dates_room)}`)
    console.log(`  dp['2026-04-16']: ${bk581.daily_price?.["2026-04-16"] ?? "(assente)"}`)
  } else {
    console.log(`28581 NON trovato in modified_from apr (cancellato a Gennaio, non modificato di recente)`)
    // Cerca con fetch stay allargato
    const extData = await scidooPost("/bookings/get.php", {
      stay_from: "2026-04-15",
      stay_to: "2026-04-17",
    })
    const extRes = extData?.reservations || extData?.bookings || []
    const bk581ext = extRes.find((b) => String(b.id) === "28581")
    if (bk581ext) {
      console.log(`\n28581 TROVATO in stay 15-17 apr:`)
      console.log(`  status:       ${bk581ext.status}`)
      console.log(`  cancellation: ${bk581ext.cancellation || "(null)"}`)
      console.log(`  list_dates_room: ${JSON.stringify(bk581ext.list_dates_room)}`)
      console.log(`  dp['2026-04-16']: ${bk581ext.daily_price?.["2026-04-16"] ?? "(assente)"}`)
    } else {
      console.log(`28581 NON trovato nemmeno in stay 15-17 apr.`)
      console.log(`Totale prenotazioni stay 15-17: ${extRes.length}`)
      // Stampa tutti i booking non-annullati per sanity
      console.log(`\nBooking non-annullati nel stay 15-17:`)
      extRes
        .filter((b) => b.status !== "annullata")
        .forEach((b) => {
          const dp16 = b.daily_price?.["2026-04-16"]
          if (dp16) {
            console.log(
              `  id=${b.id} status=${b.status} rt=${b.room_type_id} dp16=${dp16} cancel=${b.cancellation || "no"}`
            )
          }
        })
    }
  }

  // ─── STEP 4: fetch mese completo aprile — tutti i booking con dp 16 apr ───
  console.log("\n" + "=".repeat(60))
  console.log("STEP 4: stay_from=2026-04-01 to=2026-04-30 — tutti con dp16")
  console.log("=".repeat(60))

  const aprilData = await scidooPost("/bookings/get.php", {
    stay_from: "2026-04-01",
    stay_to: "2026-04-30",
  })
  const aprilRes = aprilData?.reservations || aprilData?.bookings || []
  console.log(`Totale prenotazioni Aprile: ${aprilRes.length}`)

  const withDp16 = aprilRes.filter((b) => {
    const dp = b.daily_price?.["2026-04-16"]
    return dp && Number(dp) > 0
  })
  console.log(`Con daily_price['2026-04-16'] > 0: ${withDp16.length}`)
  console.log(`\nTutti i booking con dp16 (ordinati per revenue):`)
  withDp16
    .sort((a, b) => Number(b.daily_price["2026-04-16"]) - Number(a.daily_price["2026-04-16"]))
    .forEach((b) => {
      console.log(
        `  id=${b.id} status=${b.status} rt=${b.room_type_id}(${b.room_type_name || b.room_type || "?"}) dp16=${
          b.daily_price["2026-04-16"]
        } cancel=${b.cancellation || "no"} list_dates_room=${JSON.stringify(b.list_dates_room)}`
      )
    })

  // ─── STEP 5: produzione endpoint se trovato ───
  if (productionData && productionEndpointFound) {
    console.log("\n" + "=".repeat(60))
    console.log(`STEP 5: Dati da endpoint produzione ${productionEndpointFound}`)
    console.log("=".repeat(60))
    console.log(JSON.stringify(productionData, null, 2).slice(0, 3000))
  } else {
    console.log("\n" + "=".repeat(60))
    console.log("STEP 5: Nessun endpoint production trovato — Scidoo potrebbe")
    console.log("usare un path diverso o richiedere parametri differenti.")
    console.log("=".repeat(60))
  }

  // ─── RIEPILOGO ZOMBIE ───
  console.log("\n" + "=".repeat(60))
  console.log("RIEPILOGO ZOMBIE CHECK")
  console.log("=".repeat(60))
  const allRes = [
    ...(reservations),
    ...(modRes),
    ...(aprilRes),
  ]
  const deduped = new Map()
  for (const b of allRes) {
    if (!deduped.has(String(b.id))) deduped.set(String(b.id), b)
  }

  for (const id of ["28255", "28581"]) {
    const bk = deduped.get(id)
    if (!bk) {
      console.log(`\nBooking ${id}: NON presente in nessun fetch -> non possiamo determinare lo stato live`)
      continue
    }
    console.log(`\nBooking ${id}:`)
    console.log(`  status nel PMS (API live):  ${bk.status}`)
    console.log(`  status nel DB:              annullata`)
    console.log(`  cancellation nel raw_data:  ${bk.cancellation || "(null)"}`)
    console.log(`  room_id apr 16:             ${JSON.stringify(bk.list_dates_room)}`)
    if (bk.status !== "annullata") {
      console.log(`\n  *** ZOMBIE CONFERMATO: il PMS ha status="${bk.status}" ma il DB ha "annullata" ***`)
      console.log(`  *** Il trigger va disabilitato e il booking va ripristinato ***`)
    } else {
      console.log(`\n  OK: status annullata sia nel PMS che nel DB. Non e zombie.`)
      console.log(`  Il PMS lo include nella produzione giornaliera per altri motivi`)
      console.log(`  (es. il frontend Scidoo mostra anche i cancellati durante il soggiorno)`)
    }
  }
}

main().catch(console.error)
