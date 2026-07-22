import { readFileSync } from "node:fs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://aeynirkfixurikshxfov.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  console.error("SUPABASE_SERVICE_ROLE_KEY mancante")
  process.exit(1)
}

const sql = readFileSync(new URL("./migrations/pace-rateshopper.sql", import.meta.url), "utf8")

// Split su ';' a fine riga, ignorando righe di commento puro. Le statement DDL
// qui non contengono ';' interni (nessuna funzione plpgsql), quindi lo split
// semplice e' sicuro.
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.split("\n").every((l) => l.trim().startsWith("--") || l.trim() === ""))

console.log(`Eseguo ${statements.length} statement...`)

let ok = 0
for (const [i, stmt] of statements.entries()) {
  const r = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: stmt + ";" }),
  })
  const label = stmt.slice(0, 70).replace(/\s+/g, " ")
  if (r.status === 204 || r.ok) {
    ok++
    console.log(`  [${i + 1}/${statements.length}] OK  ${label}`)
  } else {
    const body = await r.text()
    console.error(`  [${i + 1}/${statements.length}] FAIL(${r.status}) ${label}\n      ${body.slice(0, 200)}`)
  }
}
console.log(`Fatto: ${ok}/${statements.length} statement applicati.`)
