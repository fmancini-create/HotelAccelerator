// Cleanup duplicato rate Massabò 02/05/2026
// Sposta reference_rate_id 152994 → 153014, elimina pricing_grid/last_sent_prices future
// della 152994, disattiva la rate. Non tocca bookings/price_change_log storici.
//
// Run: node --env-file-if-exists=/vercel/share/.env.project scripts/cleanup-massabo-duplicate-rate.mjs

import { createClient } from "@supabase/supabase-js"

// PROD URL (vedi lib/supabase/prod-client.ts)
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://aeynirkfixurikshxfov.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env var: SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Massabò
const HOTEL_ID = "7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9"
// 152994 (duplicato sbagliato, creato manualmente 01/05/2026)
const RATE_BAD_ID = "bdedf61d-181e-4d0f-8712-301acb58a280"
// 153014 (tariffa Scidoo originale)
const RATE_GOOD_ID = "7d23f4fc-c388-42a2-a104-e7a28b0d0af8"

const TODAY = new Date().toISOString().slice(0, 10)
console.log(`[cleanup] today=${TODAY}, hotel=${HOTEL_ID}`)
console.log(`[cleanup] BAD=${RATE_BAD_ID} (152994) → GOOD=${RATE_GOOD_ID} (153014)`)

// STEP 1: sposta reference_rate_id da BAD a GOOD per le date >= today
const { data: refMoved, error: e1 } = await supabase
  .from("pricing_algo_params")
  .update({ param_value: RATE_GOOD_ID })
  .eq("hotel_id", HOTEL_ID)
  .eq("param_key", "reference_rate_id")
  .eq("param_value", RATE_BAD_ID)
  .gte("date", TODAY)
  .select("date")
if (e1) throw e1
console.log(`[cleanup] STEP 1: reference_rate_id moved on ${refMoved?.length || 0} dates`)

// STEP 2: elimina pricing_grid future per la rate BAD
const { data: gridDeleted, error: e2 } = await supabase
  .from("pricing_grid")
  .delete()
  .eq("hotel_id", HOTEL_ID)
  .eq("rate_id", RATE_BAD_ID)
  .gte("date", TODAY)
  .select("id")
if (e2) throw e2
console.log(`[cleanup] STEP 2: pricing_grid future deleted: ${gridDeleted?.length || 0} rows`)

// STEP 3: elimina last_sent_prices future per la rate BAD (cosi' il push range
// non vede combinazioni fantasma, e il pricing-coverage report non mostra
// la rate dismessa come "non allineata")
const { data: lspDeleted, error: e3 } = await supabase
  .from("last_sent_prices")
  .delete()
  .eq("hotel_id", HOTEL_ID)
  .eq("rate_id", RATE_BAD_ID)
  .gte("target_date", TODAY)
  .select("id")
if (e3) throw e3
console.log(`[cleanup] STEP 3: last_sent_prices future deleted: ${lspDeleted?.length || 0} rows`)

// STEP 4: rate_adj_<BAD_ID> in pricing_algo_params (offset daily) — sposto su GOOD se esistono
const adjKeyBad = `rate_adj_${RATE_BAD_ID}`
const adjKeyGood = `rate_adj_${RATE_GOOD_ID}`
const { data: adjMoved, error: e4 } = await supabase
  .from("pricing_algo_params")
  .update({ param_key: adjKeyGood })
  .eq("hotel_id", HOTEL_ID)
  .eq("param_key", adjKeyBad)
  .gte("date", TODAY)
  .select("date")
// Ignora errore di unique conflict: significa che esiste gia' rate_adj per GOOD,
// in quel caso preferiamo tenere GOOD esistente (la rate giusta ha la sua config).
if (e4 && e4.code !== "23505") throw e4
console.log(`[cleanup] STEP 4: rate_adj_${RATE_BAD_ID.slice(0, 8)}... moved: ${adjMoved?.length || 0} (eventuale conflict ignorato)`)

// STEP 5: disattiva la rate 152994 (non cancello — preservo FK con bookings/price_change_log)
const { error: e5 } = await supabase
  .from("rates")
  .update({ is_active: false, updated_at: new Date().toISOString() })
  .eq("id", RATE_BAD_ID)
if (e5) throw e5
console.log(`[cleanup] STEP 5: rate 152994 deactivated (is_active=false)`)

// VERIFICA: stato post-cleanup
const { data: gridAfter } = await supabase
  .from("pricing_grid")
  .select("rate_id", { count: "exact", head: true })
  .eq("hotel_id", HOTEL_ID)
  .eq("rate_id", RATE_BAD_ID)
  .gte("date", TODAY)
console.log(`[cleanup] VERIFY: pricing_grid future for BAD rate = should be 0`)

const { count: gridGood } = await supabase
  .from("pricing_grid")
  .select("*", { count: "exact", head: true })
  .eq("hotel_id", HOTEL_ID)
  .eq("rate_id", RATE_GOOD_ID)
  .gte("date", TODAY)
console.log(`[cleanup] VERIFY: pricing_grid future for GOOD rate = ${gridGood} rows`)

console.log("[cleanup] Done. Now lancia push range dalla UI per riallineare il PMS.")
