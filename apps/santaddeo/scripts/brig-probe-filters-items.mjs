// ============================================================================
// BRiG — probe FILTRI a livello ITEMS (non totalItems)
// ============================================================================
// Obiettivo: scoprire se l'endpoint daily-occupancy-filters accetta un filtro
// di PERIODO che agisce sugli ITEMS restituiti. Se SI', possiamo fare un fetch
// PARTIZIONATO per slice di data (deterministico, completo) e curare la deriva.
//
// METODO CORRETTO (il probe v1 sbagliava): NON guardare `totalItems` (globale,
// immune al filtro -> falso negativo). Guardare i `checkin` degli ITEMS:
//   - chiediamo una finestra STRETTA e nota (es. 2026-08-10..2026-08-17)
//   - se i checkin tornano DENTRO/coerenti con la finestra => filtro FUNZIONA
//   - se tornano sparsi su tutto l'anno (come unfiltered) => filtro IGNORATO
//
// Quota: ~1 richiesta per candidato (default pageSize 100). Resta sotto i 200/g.
// Eseguire SOLO a quota fresca:
//   set -a && source /vercel/share/.env.project && set +a && node scripts/brig-probe-filters-items.mjs
// ============================================================================
import { createClient } from "@supabase/supabase-js"

const BASE = "https://brig-service-dot-brig-400706.ew.r.appspot.com"
const SUPA_URL = process.env.SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const HOTEL_ID = "bb880163-3973-451b-89a0-6c965b07712b"

// Finestra di prova: una settimana d'agosto dove SAPPIAMO di sottostimare.
const WIN_FROM = "2026-08-10"
const WIN_TO = "2026-08-17"

const pub = createClient(SUPA_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: integ, error } = await pub
  .from("pms_integrations")
  .select("api_key, property_id")
  .eq("hotel_id", HOTEL_ID)
  .eq("pms_name", "brig")
  .maybeSingle()
if (error || !integ) {
  console.error("Integrazione BRiG non trovata:", error?.message)
  process.exit(1)
}
const STRUCT = integ.property_id

async function call(extra, label) {
  const body = { page: 1, pageSize: 100, structureId: [STRUCT], ...extra }
  try {
    const res = await fetch(`${BASE}/api/ext/reservations/daily-occupancy-filters`, {
      method: "POST",
      headers: { "x-api-key": integ.api_key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    const txt = await res.text()
    if (res.status === 429) {
      console.log(`\n[${label}] 429 QUOTA ESAURITA — stop. ${txt.slice(0, 80)}`)
      process.exit(2)
    }
    if (!res.ok) {
      console.log(`[${label}] status ${res.status}: ${txt.slice(0, 120)}`)
      return null
    }
    const json = JSON.parse(txt)
    const items = json.items || json.data || json.reservations || []
    return { total: json.totalItems ?? json.total ?? null, items }
  } catch (e) {
    console.log(`[${label}] errore: ${String(e).slice(0, 100)}`)
    return null
  }
}

// Estrae i checkin (qualunque sia il nome del campo) per misurare coerenza.
function checkins(items) {
  const out = []
  for (const it of items) {
    const c = it.checkin || it.checkIn || it.arrival || it.arrivalDate || it.dateIn || it.from
    if (c) out.push(String(c).slice(0, 10))
  }
  return out
}
function inWindow(dates) {
  let inside = 0
  for (const d of dates) if (d >= WIN_FROM && d <= WIN_TO) inside++
  return dates.length ? Math.round((inside / dates.length) * 100) : 0
}

// 1) Baseline NON filtrata (riferimento per "sparsi su tutto l'anno").
const base = await call({}, "baseline")
if (base) {
  const ck = checkins(base.items)
  console.log(`\n=== BASELINE (no filter) ===`)
  console.log(`total=${base.total} items=${base.items.length} %inFinestra=${inWindow(ck)}`)
  console.log(`primi checkin: ${ck.slice(0, 8).join(", ")}`)
}

// 2) Candidati di filtro periodo. Semantica nota: checkout>from AND checkin<to.
const C = []
const f = WIN_FROM, t = WIN_TO
C.push([{ checkInFrom: f, checkInTo: t }, "checkInFrom/checkInTo"])
C.push([{ checkinFrom: f, checkinTo: t }, "checkinFrom/checkinTo"])
C.push([{ arrivalFrom: f, arrivalTo: t }, "arrivalFrom/arrivalTo"])
C.push([{ dateFrom: f, dateTo: t }, "dateFrom/dateTo"])
C.push([{ from: f, to: t }, "from/to"])
C.push([{ checkInStart: f, checkInEnd: t }, "checkInStart/checkInEnd"])
C.push([{ periodFrom: f, periodTo: t }, "periodFrom/periodTo"])
C.push([{ occupancyFrom: f, occupancyTo: t }, "occupancyFrom/occupancyTo"])
C.push([{ filters: { checkInFrom: f, checkInTo: t } }, "filters.checkInFrom"])
C.push([{ checkIn: { from: f, to: t } }, "checkIn{from,to}"])
C.push([{ dateRange: { from: f, to: t } }, "dateRange{from,to}"])

console.log(`\n=== PROBE FILTRI (finestra ${WIN_FROM}..${WIN_TO}) ===`)
for (const [extra, label] of C) {
  const r = await call(extra, label)
  if (!r) continue
  const ck = checkins(r.items)
  const pct = inWindow(ck)
  // Verdetto: se gli items sono PREVALENTEMENTE nella finestra => filtro attivo.
  const verdict = pct >= 70 ? "  <<< FILTRO ATTIVO?" : pct === 0 ? " (ignorato)" : ""
  console.log(`[${label}] items=${r.items.length} total=${r.total} %inFinestra=${pct}${verdict}`)
}
console.log(`\nFINE. Se un candidato ha %inFinestra alto, quello e' il filtro -> fetch partizionato.`)
