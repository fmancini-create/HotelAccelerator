import { createClient } from "@supabase/supabase-js"

const URL = "https://aeynirkfixurikshxfov.supabase.co"
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HOTEL = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca" // Villa I Barronci
// CLI: node scripts/fiscal-july-recon.mjs 2026-06-01 2026-06-30
const FROM = process.argv[2] || "2026-07-01"
const TO = process.argv[3] || "2026-07-31"

const sb = createClient(URL, KEY, { db: { schema: "connectors" }, auth: { persistSession: false } })

const { data, error } = await sb
  .from("scidoo_raw_fiscal_production")
  .select("date,total_revenue,raw_data")
  .eq("hotel_id", HOTEL)
  .gte("date", FROM)
  .lte("date", TO)

if (error) {
  console.log("ERROR", error.message)
  process.exit(1)
}

let lordo = 0
let netto = 0
let nDocs = 0
let nRows = data.length
const netByDept = {}
const grossByDept = {}
const docTypes = {}
const perDay = {}

const deptLabel = (ar) => {
  if (ar.name) return ar.name
  if (String(ar.code ?? "") === "0") return "Acconti"
  return "Non Classificato"
}

for (const row of data) {
  const documents = row.raw_data?.documents || []
  let dayLordo = 0
  for (const doc of documents) {
    if (doc.type === "deposit" || doc.type === "suspended_invoice") continue
    nDocs++
    const withVat = Number(doc.total) || 0
    const ars = doc.account_revenues || []
    let taxable = 0
    for (const ar of ars) taxable += Number(ar.value) || 0
    const grossFactor = taxable > 0 ? withVat / taxable : 1
    for (const ar of ars) {
      const net = Number(ar.value) || 0
      const k = deptLabel(ar)
      netByDept[k] = (netByDept[k] || 0) + net
      grossByDept[k] = (grossByDept[k] || 0) + net * grossFactor
    }
    lordo += withVat
    netto += taxable
    dayLordo += withVat
    const dt = doc.type || "invoice"
    docTypes[dt] = (docTypes[dt] || 0) + withVat
  }
  perDay[row.date] = (perDay[row.date] || 0) + dayLordo
}

const r = (n) => Math.round(n * 100) / 100
console.log(`=== ${FROM} -> ${TO} - Villa I Barronci (dati CERTI connectors) ===`)
console.log("righe tabella:", nRows, "| documenti (escl. deposit/suspended):", nDocs)
console.log("LORDO (== Scidoo Non Scorporato):", r(lordo))
console.log("NETTO (== Scidoo Scorporato):    ", r(netto))
console.log("\n--- Breakdown NETTO per categoria ---")
for (const [k, v] of Object.entries(netByDept).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(24), r(v))
console.log("\n--- Breakdown LORDO per categoria ---")
for (const [k, v] of Object.entries(grossByDept).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(24), r(v))
console.log("\n--- Tipi documento (lordo) ---")
for (const [k, v] of Object.entries(docTypes).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(24), r(v))
console.log("\n--- LORDO per giorno (primi/ultimi) ---")
const days = Object.entries(perDay).sort((a, b) => a[0].localeCompare(b[0]))
for (const [d, v] of days) console.log(d, r(v))
