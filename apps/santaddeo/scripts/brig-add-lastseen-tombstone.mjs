// Migrazione: aggiunge a connectors.brig_raw_bookings le colonne per la
// riconciliazione SICURA delle cancellazioni stale (finestra di grazia su
// last_seen_at). Vedi memory santaddeo-brig-availability-derived-pagination-drift.
//
// - last_seen_at: timestamp dell'ULTIMO avvistamento della prenotazione nel feed
//   BRiG (bumpato ad ogni sighting, anche se raw_data invariato).
// - is_stale_cancelled: tombstone locale. true = non avvistata da > grace ->
//   trattata come cancellata dal processor availability. Azzerata appena la
//   prenotazione ricompare nel feed (auto-correzione).
//
// DDL via RPC exec_sql (param `query`, NON `sql`; vedi memory).
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error("manca SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const statements = [
  `ALTER TABLE connectors.brig_raw_bookings
     ADD COLUMN IF NOT EXISTS last_seen_at timestamptz`,
  `ALTER TABLE connectors.brig_raw_bookings
     ADD COLUMN IF NOT EXISTS is_stale_cancelled boolean NOT NULL DEFAULT false`,
  // Backfill a now(): la finestra di grazia parte fresca per TUTTE le righe
  // esistenti -> zero falsi tombstone al rollout. Le cancellazioni stale reali
  // verranno colte entro ~grace giorni quando non si ri-avvistano.
  `UPDATE connectors.brig_raw_bookings
     SET last_seen_at = now()
     WHERE last_seen_at IS NULL`,
  // Indice per rendere economica la riconciliazione (filtra per hotel + checkout
  // futuro + last_seen_at).
  `CREATE INDEX IF NOT EXISTS idx_brig_raw_lastseen
     ON connectors.brig_raw_bookings (hotel_id, checkout, last_seen_at)`,
]

for (const [i, query] of statements.entries()) {
  const { error } = await sb.rpc("exec_sql", { query })
  if (error) {
    console.error(`statement ${i + 1} FAILED:`, error.message)
    process.exit(1)
  }
  console.log(`statement ${i + 1} OK`)
}

// Verifica colonne
const { data, error } = await sb
  .schema("connectors")
  .from("brig_raw_bookings")
  .select("last_seen_at, is_stale_cancelled")
  .limit(1)
console.log("verify:", error ? error.message : "columns present", data?.[0] ?? {})
