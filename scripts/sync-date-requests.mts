/**
 * Riallinea la pipeline CRM alle estrazioni già in archivio.
 *
 * Per difetto NON scrive: stampa quante righe nascerebbero. Serve `--commit`
 * per scrivere davvero, perché un travaso su dati veri non deve poter partire
 * per sbaglio da una riga di comando ricopiata.
 *
 *   node --env-file-if-exists=/vercel/share/.env.project \
 *        --experimental-strip-types scripts/sync-date-requests.mts [--commit]
 *
 * A regime il travaso lo fa il cron `/api/cron/demand-extract` dopo ogni
 * estrazione: questo script serve per lo storico, cioè una volta.
 */

import { createClient } from "@supabase/supabase-js"
import { allineaRichiesteDate } from "../lib/crm/date-requests-sync"

const scrivi = process.argv.includes("--commit")

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Credenziali Supabase assenti: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const { data: strutture, error } = await supabase.from("properties").select("id, name").order("name")
if (error) {
  console.error("Lettura strutture:", error.message)
  process.exit(1)
}

console.log(scrivi ? "MODALITA' SCRITTURA\n" : "PROVA SENZA SCRIVERE (aggiungi --commit per scrivere)\n")

let totInserite = 0
let totGia = 0
let totTraducibili = 0

for (const s of strutture ?? []) {
  const r = await allineaRichiesteDate(supabase, s.id as string, { provaSenzaScrivere: !scrivi })
  totTraducibili += r.traducibili
  totInserite += r.inserite
  totGia += r.giaPresenti
  const dettaglio = scrivi
    ? `inserite ${r.inserite}, già presenti ${r.giaPresenti}, fallite ${r.fallite}`
    : `traducibili ${r.traducibili}`
  console.log(`  ${String(s.name).padEnd(28)} esaminate ${String(r.esaminate).padStart(5)}   ${dettaglio}`)
  for (const e of r.errori) console.log(`      errore: ${e.slice(0, 120)}`)
}

console.log(
  scrivi
    ? `\n  TOTALE: inserite ${totInserite}, già presenti ${totGia}`
    : `\n  TOTALE traducibili: ${totTraducibili} (nessuna scrittura eseguita)`,
)
