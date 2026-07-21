// Run schema migration via exec_sql RPC, splitting on ';' boundaries.
// Usage: node --env-file=/vercel/share/.env.project scripts/run-onboarding-schema.mjs
import { readFileSync } from "node:fs"

const URL_PROD = "https://aeynirkfixurikshxfov.supabase.co"
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const sql = readFileSync(new URL("./sql/onboarding-revman-schema.sql", import.meta.url), "utf8")

// Split su ';' al fuori da stringhe semplici. Per il nostro file e' sufficiente.
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"))

console.log(`[v0] Executing ${statements.length} statements`)
let ok = 0
let fail = 0
for (const [i, stmt] of statements.entries()) {
  const preview = stmt.split("\n")[0].slice(0, 80)
  const res = await fetch(`${URL_PROD}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ query: stmt }),
  })
  const txt = await res.text()
  if (!res.ok) {
    console.error(`[v0] FAIL #${i + 1} (${preview}...): ${txt.slice(0, 200)}`)
    fail++
  } else {
    console.log(`[v0] OK   #${i + 1} ${preview}`)
    ok++
  }
}
console.log(`\n[v0] Done. ok=${ok} fail=${fail}`)
process.exit(fail > 0 ? 1 : 0)
