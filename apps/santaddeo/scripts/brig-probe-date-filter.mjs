/**
 * Probe mirato BRiG: verifica il formato filtri fornito da BRiG il 06/06/2026
 *   { from, operatorFrom, to, operatorTo }  con date YYYY-MM-DD
 * Obiettivo: confermare con POCHE chiamate (quota sandbox 100/g) che il filtro
 * periodo e' ONORATO (totalItems cambia). Sandbox baseline nota = 32 prenotazioni.
 */
const BASE = process.env.BRIG_BASE_URL
const KEY = process.env.BRIG_TEST_API_KEY
const SID = process.env.BRIG_TEST_STRUCTURE_ID

const norm = (s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`).replace(/\/$/, "")
const URLB = `${norm(BASE)}/api/ext/reservations/daily-occupancy-filters`

async function call(label, extra) {
  const body = { page: 1, pageSize: 100, structureId: [SID], ...extra }
  const res = await fetch(URLB, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (res.status === 429) {
    console.log(`[${label}] 429 QUOTA: ${text.slice(0, 80)}`)
    return null
  }
  let j
  try { j = JSON.parse(text) } catch { console.log(`[${label}] non-JSON ${res.status}: ${text.slice(0,80)}`); return null }
  const items = j.items ?? j.data ?? j.reservations ?? []
  const checkins = items.map((r) => String(r.checkin ?? "").slice(0, 10)).filter(Boolean).sort()
  console.log(`[${label}] status=${res.status} totalItems=${j.totalItems ?? "?"} items=${items.length} checkinRange=${checkins[0] ?? "-"}..${checkins[checkins.length-1] ?? "-"}`)
  return { total: j.totalItems, count: items.length, checkins }
}

;(async () => {
  // 1) baseline senza filtri
  const base = await call("baseline", {})
  if (!base) return
  // 2) checkInDate >= 2025-06-01 (dovrebbe ESCLUDERE le prenotazioni feb-2025)
  await call("checkin>=2025-06-01", {
    checkInDate: { from: "2025-06-01", operatorFrom: ">=" },
  })
  // 3) checkInDate <= 2025-03-01 (dovrebbe TENERE solo le feb-2025 ~9)
  await call("checkin<=2025-03-01", {
    checkInDate: { from: "2025-03-01", operatorFrom: "<=" },
  })
  // 4) finestra completa from/to come da esempio BRiG
  await call("checkin 2025-01-01..2025-03-01", {
    checkInDate: { from: "2025-01-01", operatorFrom: ">=", to: "2025-03-01", operatorTo: "<=" },
  })
})()
