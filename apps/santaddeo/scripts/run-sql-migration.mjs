#!/usr/bin/env node
/**
 * Esegue uno SQL file su Supabase prod usando l'endpoint REST `pg` (admin).
 * Uso: node --env-file=/vercel/share/.env.project scripts/run-sql-migration.mjs <file.sql>
 *
 * Richiede SUPABASE_SERVICE_ROLE_KEY. URL prod hardcoded come in lib/supabase/server.ts.
 *
 * NB: Supabase non espone un endpoint per eseguire SQL arbitrario via REST.
 * Usiamo una funzione RPC `exec_sql` se esiste, altrimenti splittiamo in
 * statements e li eseguiamo via management API. Fallback: stampiamo i comandi
 * e li eseguiamo manualmente con psql/sql editor di Supabase.
 *
 * In Santaddeo abbiamo `pg_meta.query` esposto sul project? No, non l'abbiamo.
 * Soluzione semplice: usiamo l'endpoint /rest/v1/rpc/exec_sql se l'utente
 * ha gia' creato la funzione. Per la prima migration, dobbiamo passare a
 * mano oppure usare un connector psql diretto con DATABASE_URL.
 *
 * Visto che non abbiamo DATABASE_URL nel .env.project, l'approccio piu'
 * affidabile e' chiamare la migration con l'helper che gia' esiste in
 * scripts. Ma non c'e' un runner generico, quindi ne creiamo uno tramite
 * il service role di Supabase + l'endpoint `pg-meta` se attivo.
 */
import { readFileSync } from "node:fs"
import { argv, exit } from "node:process"

const PROD_URL = "https://aeynirkfixurikshxfov.supabase.co"
const file = argv[2]
if (!file) {
  console.error("Usage: node scripts/run-sql-migration.mjs <file.sql>")
  exit(1)
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY")
  exit(1)
}

const sql = readFileSync(file, "utf8")

// Tentativo via RPC exec_sql
const res = await fetch(`${PROD_URL}/rest/v1/rpc/exec_sql`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ sql }),
})

const text = await res.text()
console.log("Status:", res.status)
console.log("Body:", text.slice(0, 2000))

if (!res.ok) {
  console.error(
    "\nNB: se l'errore e' 404 (function not found), serve creare la funzione exec_sql in Supabase oppure eseguire la SQL manualmente da Supabase SQL editor.",
  )
  exit(1)
}
