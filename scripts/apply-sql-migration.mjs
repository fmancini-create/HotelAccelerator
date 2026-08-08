#!/usr/bin/env node
/**
 * Run a .sql migration inside ONE transaction, with a mandatory dry run.
 *
 * This repository has no migration workflow in .github/workflows: migrations
 * are applied by hand. The Supabase MCP refuses BEGIN/ROLLBACK, so it cannot
 * prove what a destructive script will do before it does it. This runner can:
 * it takes the same before/after census in both modes and only differs in the
 * final COMMIT.
 *
 *   node --env-file-if-exists=/vercel/share/.env.project \
 *     scripts/apply-sql-migration.mjs scripts/210_xxx.sql            # dry run
 *   node --env-file-if-exists=/vercel/share/.env.project \
 *     scripts/apply-sql-migration.mjs scripts/210_xxx.sql --apply    # for real
 *
 * `pg` is not a project dependency. Install it first with
 * `npm install pg --no-save` (NODE_PATH does not work here: ESM imports ignore
 * it, so the package has to be resolvable from the project itself).
 */

import { readFileSync } from "node:fs"
import pg from "pg"

const file = process.argv[2]
const apply = process.argv.includes("--apply")

if (!file) {
  console.error("Uso: apply-sql-migration.mjs <file.sql> [--apply]")
  process.exit(1)
}

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
if (!connectionString) {
  console.error("POSTGRES_URL_NON_POOLING/POSTGRES_URL non disponibili nell'ambiente")
  process.exit(1)
}

// The census is deliberately generic: row counts plus the referential checks
// that a merge can break. Anything that must stay constant is asserted below.
const CENSUS = `
SELECT
  (SELECT count(*) FROM contacts)                                        AS contatti,
  (SELECT count(*) FROM conversations)                                   AS conversazioni,
  (SELECT count(*) FROM messages)                                        AS messaggi,
  (SELECT count(*) FROM contact_date_requests)                           AS richieste_date,
  (SELECT count(*) FROM contact_stays)                                   AS soggiorni,
  (SELECT count(*) FROM email_campaign_recipients)                       AS destinatari_campagne,
  (SELECT count(*) FROM contact_segment_members)                         AS membri_segmenti,
  (SELECT count(*) FROM conversations WHERE contact_id IS NULL)          AS conv_senza_contatto,
  -- Columns the migration itself creates cannot appear here: the census runs
  -- before the migration and Postgres resolves identifiers at parse time.
  (SELECT count(*) FROM conversations c WHERE c.channel = 'email'
      AND NOT (to_jsonb(c) ->> 'contact_email' IS NOT NULL))             AS conv_email_senza_mittente,
  -- Only customer messages point at contacts. On agent messages sender_id is
  -- an admin user id, so counting those as orphans raises a false alarm (there
  -- is one such row from a deleted operator, unrelated to this migration).
  (SELECT count(*) FROM messages m WHERE m.sender_id IS NOT NULL
      AND m.sender_type = 'customer'
      AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = m.sender_id)) AS sender_orfani,
  (SELECT count(*) FROM conversations v WHERE v.contact_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = v.contact_id)) AS contatti_orfani,
  (SELECT count(*) FROM (
      SELECT 1 FROM contacts WHERE email IS NOT NULL AND email <> '' AND property_id IS NOT NULL
      GROUP BY property_id, lower(email) HAVING count(*) > 1) q)          AS gruppi_contatti_doppi,
  (SELECT count(*) FROM (
      SELECT 1 FROM conversations WHERE gmail_thread_id IS NOT NULL AND property_id IS NOT NULL
      GROUP BY property_id, gmail_thread_id HAVING count(*) > 1) q)       AS gruppi_thread_doppi
`

// Invariants: a cleanup that loses a message or orphans a pointer is a bug,
// not a cleanup. These are checked on the "after" census in BOTH modes.
const INVARIANTS = [
  ["messaggi", (b, a) => a.messaggi === b.messaggi, "nessun messaggio deve sparire"],
  ["richieste_date", (b, a) => a.richieste_date === b.richieste_date, "nessuna richiesta data deve sparire"],
  ["soggiorni", (b, a) => a.soggiorni === b.soggiorni, "nessun soggiorno deve sparire"],
  ["sender_orfani", (_b, a) => a.sender_orfani === 0, "nessun messaggio deve puntare a un contatto inesistente"],
  ["contatti_orfani", (_b, a) => a.contatti_orfani === 0, "nessuna conversazione deve puntare a un contatto inesistente"],
  ["gruppi_contatti_doppi", (_b, a) => a.gruppi_contatti_doppi === 0, "nessun contatto duplicato deve restare"],
  ["gruppi_thread_doppi", (_b, a) => a.gruppi_thread_doppi === 0, "nessun thread duplicato deve restare"],
]

// Supabase pooler URLs carry `sslmode=require`, which recent pg versions treat
// as `verify-full`; the pooler presents a self-signed chain and the handshake
// fails. Drop the parameter so the explicit ssl option below is the one that
// applies (TLS stays on, only chain verification is relaxed).
const dsn = new URL(connectionString)
dsn.searchParams.delete("sslmode")

const sql = readFileSync(file, "utf8")
const client = new pg.Client({ connectionString: dsn.toString(), ssl: { rejectUnauthorized: false } })

const num = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]))

await client.connect()
let committed = false
try {
  await client.query("BEGIN")

  const before = num((await client.query(CENSUS)).rows[0])
  await client.query(sql)
  const after = num((await client.query(CENSUS)).rows[0])

  console.log(`\nModalita': ${apply ? "APPLICAZIONE REALE" : "PROVA A VUOTO (rollback finale)"}`)
  console.log(`File: ${file}\n`)
  console.log("misura".padEnd(30), "prima".padStart(10), "dopo".padStart(10), "differenza".padStart(12))
  console.log("-".repeat(66))
  for (const key of Object.keys(before)) {
    const d = after[key] - before[key]
    console.log(key.padEnd(30), String(before[key]).padStart(10), String(after[key]).padStart(10), (d > 0 ? `+${d}` : String(d)).padStart(12))
  }

  console.log("\nInvarianti:")
  let failed = 0
  for (const [name, check, why] of INVARIANTS) {
    const ok = check(before, after)
    if (!ok) failed++
    console.log(`  ${ok ? "OK  " : "ROTTA"} ${name.padEnd(24)} ${why}`)
  }

  if (failed > 0) {
    console.error(`\n${failed} invarianti rotte: annullo comunque.`)
    await client.query("ROLLBACK")
  } else if (apply) {
    await client.query("COMMIT")
    committed = true
    console.log("\nCOMMIT eseguito.")
  } else {
    await client.query("ROLLBACK")
    console.log("\nROLLBACK eseguito: nessuna modifica salvata.")
  }

  process.exitCode = failed > 0 ? 1 : 0
} catch (e) {
  if (!committed) {
    try {
      await client.query("ROLLBACK")
    } catch {}
  }
  console.error("\nERRORE:", e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
