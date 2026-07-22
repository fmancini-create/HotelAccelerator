#!/usr/bin/env node
/**
 * IPOTESI 3 — Somma i daily_price dell'API Scidoo LIVE per Gennaio 2026.
 * Stesso range dello script precheck. Nessuna modifica al DB.
 */

import { createClient } from "@supabase/supabase-js"

const HOTEL_ID = "8dd3f8c1-284a-43f1-b24f-e6a9d428edca"
const SUPABASE_URL = "https://aeynirkfixurikshxfov.supabase.co"

const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- Credenziali Scidoo ---
const { data: integ, error: integErr } = await sb
  .from("pms_integrations")
  .select("api_key, property_id")
  .eq("hotel_id", HOTEL_ID)
  .eq("pms_name", "scidoo")
  .single()

if (integErr || !integ) { console.error("integ err:", integErr); process.exit(1) }

const API_KEY = integ.api_key
const PROPERTY_ID = String(integ.property_id)

// --- Fetch API Scidoo per Gennaio ---
async function fetchRange(stayFrom, stayTo) {
  const res = await fetch("https://www.scidoo.com/api/v1/bookings/get.php", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": API_KEY },
    body: JSON.stringify({
      property_id: PROPERTY_ID,
      stay_from: stayFrom,
      stay_to: stayTo,
    }),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 200)}`)
  }
  return json.reservations || []
}

console.log("[IPOTESI 3] Fetching Gennaio 2026 da API Scidoo live...")
const bookings = await fetchRange("2026-01-01", "2026-01-31")
console.log(`[IPOTESI 3] Booking totali ricevuti: ${bookings.length}`)

// --- Dedup per booking_id con max internal_id (stesso criterio della sync) ---
const byId = new Map()
for (const b of bookings) {
  const id = String(b.id || b.internal_id)
  const iid = parseInt(String(b.internal_id || "0"), 10)
  const ex = byId.get(id)
  if (!ex || iid > parseInt(String(ex.internal_id || "0"), 10)) byId.set(id, b)
}
console.log(`[IPOTESI 3] Dopo dedup per booking_id: ${byId.size}`)

// --- Solo attivi e somma daily_price per date nel range gennaio ---
const active = [...byId.values()].filter((b) => b.status && b.status !== "annullata")
console.log(`[IPOTESI 3] Attivi (status != annullata): ${active.length}`)

const START = new Date("2026-01-01T00:00:00Z")
const END = new Date("2026-02-01T00:00:00Z")

function parseKeyToDate(k) {
  if (k.includes("/")) {
    const [d, m, y] = k.split("/")
    return new Date(`${y}-${m}-${d}T00:00:00Z`)
  }
  return new Date(`${k}T00:00:00Z`)
}

let sumGross = 0
let sumNetWithDiscounts = 0
let linesInJan = 0
let bookingsContributing = 0

for (const b of active) {
  const dp = b.daily_price
  if (!dp || typeof dp !== "object" || Array.isArray(dp)) continue

  // Totale daily_price del booking (per ripartizione sconti pro-rata)
  let bookingDpTotal = 0
  for (const [, v] of Object.entries(dp)) {
    const n = parseFloat(String(v))
    if (Number.isFinite(n) && n > 0 && n !== 999 && n !== 9999) bookingDpTotal += n
  }
  if (bookingDpTotal <= 0) continue

  // Totale sconti (extras con price < 0 in categorie sconto)
  let totDiscount = 0
  const extras = Array.isArray(b.extras) ? b.extras : []
  for (const ex of extras) {
    const pr = parseFloat(String(ex.price))
    if (!Number.isFinite(pr) || pr >= 0) continue
    const cat = String(ex.category || "").toLowerCase()
    const desc = String(ex.description || "").toLowerCase()
    if (
      cat.includes("sconti") ||
      cat.includes("servizio nota") ||
      desc.includes("sconto") ||
      desc.includes("addebito libero")
    ) {
      totDiscount += pr
    }
  }

  // Per ogni notte nel range gennaio
  let contributes = false
  for (const [k, v] of Object.entries(dp)) {
    const n = parseFloat(String(v))
    if (!Number.isFinite(n) || n <= 0 || n === 999 || n === 9999) continue
    const d = parseKeyToDate(k)
    if (d < START || d >= END) continue
    sumGross += n
    sumNetWithDiscounts += n + (n / bookingDpTotal) * totDiscount
    linesInJan += 1
    contributes = true
  }
  if (contributes) bookingsContributing += 1
}

console.log("")
console.log("=== IPOTESI 3 — Totale Gennaio 2026 da API LIVE ===")
console.log(`Booking che contribuiscono a Gennaio: ${bookingsContributing}`)
console.log(`Linee notte totali:                   ${linesInJan}`)
console.log(`Somma daily_price GROSS (no sconti):  ${sumGross.toFixed(2)} €`)
console.log(`Somma daily_price NET (con sconti):   ${sumNetWithDiscounts.toFixed(2)} €`)
console.log("")
console.log(`DB (dashboard):  76.111 €`)
console.log(`PMS (Pernotto):  61.283 €`)
