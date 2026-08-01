/**
 * Rigenera docs/MODULE_REGISTRY.md leggendo lo stato REALE dal database.
 *
 * Perché generato e non scritto a mano: i moduli vivono in `modules` e
 * `tenant_modules`. Un elenco copiato a mano diverge al primo modulo aggiunto
 * e diventa una bugia che sembra autorevole.
 *
 * Uso:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/generate-module-registry.mjs
 *
 * Sola lettura: non esegue alcuna scrittura sul database.
 */

import { createClient } from "@supabase/supabase-js"
import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/MODULE_REGISTRY.md")

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("[registry] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY non configurate. Interrotto.")
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

/**
 * PostgREST tronca ogni select a 1.000 righe SENZA errore: un totale calcolato
 * su una query non paginata è silenziosamente sbagliato. Si ordina su `id`
 * (univoco): su una colonna con duplicati le righe al confine si ripetono.
 */
async function fetchAll(table, columns, orderCol = "id") {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

const modules = await fetchAll(
  "modules",
  "key,name,category,is_core,is_available,legacy_flag,sort_order",
  "key",
)
const links = await fetchAll("tenant_modules", "property_id,module_key,status", "id")
const properties = await fetchAll("properties", "id", "id")

const activeByModule = new Map()
for (const l of links) {
  if (l.status !== "active") continue
  if (!activeByModule.has(l.module_key)) activeByModule.set(l.module_key, new Set())
  activeByModule.get(l.module_key).add(l.property_id)
}

modules.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.key.localeCompare(b.key))

const si = (v) => (v ? "sì" : "no")
const rows = modules
  .map((m) => {
    const n = activeByModule.get(m.key)?.size ?? 0
    return `| \`${m.key}\` | ${m.name ?? "—"} | ${m.category ?? "—"} | ${si(m.is_core)} | ${si(m.is_available)} | ${si(m.legacy_flag)} | **${n}** |`
  })
  .join("\n")

const propsWithModules = new Set(links.filter((l) => l.status === "active").map((l) => l.property_id)).size
const orphans = modules.filter((m) => (activeByModule.get(m.key)?.size ?? 0) === 0).map((m) => `\`${m.key}\``)
const coreMismatch = modules
  .filter((m) => m.category === "core" && !m.is_core)
  .map((m) => `\`${m.key}\``)

const doc = `# Registro dei moduli

> **File generato.** Non modificarlo a mano: rigeneralo con
> \`node --env-file-if-exists=/vercel/share/.env.project scripts/generate-module-registry.mjs\`
>
> Ultima generazione: ${new Date().toISOString().slice(0, 10)} · Fonte: tabelle \`modules\` e \`tenant_modules\`

## Moduli registrati

| Chiave | Nome | Categoria | is_core | Disponibile | Legacy | Strutture attive |
|---|---|---|---|---|---|---|
${rows}

## Adozione reale

- Strutture in piattaforma: **${properties.length}**
- Strutture con almeno un modulo attivo: **${propsWithModules}**
- Righe di attivazione: **${links.length}** (di cui \`active\`: **${links.filter((l) => l.status === "active").length}**)

${
  propsWithModules <= 1
    ? `Con **${propsWithModules}** struttura attiva la piattaforma è a livello **Tenant reale**, *non* **Multi-tenant** (vedi \`AGENTS.md\` §1). L'isolamento fra tenant non è quindi dimostrato dall'uso: va verificato per lettura del codice e con prove dedicate.`
    : `Strutture attive: ${propsWithModules}.`
}

## Anomalie rilevate

${orphans.length ? `- Registrati ma attivi su **zero** strutture: ${orphans.join(", ")}. Sono a livello **Codice**: la presenza in tabella non significa che siano integrati.` : "- Nessun modulo orfano."}
${coreMismatch.length ? `- \`category = 'core'\` ma \`is_core = false\`: ${coreMismatch.join(", ")}. Due nozioni diverse di "core" che non coincidono: chi filtra sull'una ottiene un insieme differente dall'altra.` : "- `category` e `is_core` coerenti."}

## Nota sul modello dati

Il "tenant" è di fatto la **struttura**: \`tenant_modules.property_id\` punta a
\`properties.id\`. Non esiste un livello organizzazione separato. Chi progetta
l'isolamento multi-tenant deve partire da questo vincolo.
`

writeFileSync(OUT, doc)
console.log(`[registry] scritto ${OUT} — ${modules.length} moduli, ${properties.length} strutture`)
