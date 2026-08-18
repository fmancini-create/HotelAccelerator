/**
 * Contratto del cruscotto.
 *
 * Verifica cose che il compilatore non puo' vedere:
 *
 *  - ogni pannello ha una card che lo disegna (un pannello "visibile" senza card
 *    renderebbe il nulla, in silenzio: sembra un guasto e non lo si trova);
 *  - ogni indirizzo dichiarato esiste davvero sul disco;
 *  - i pannelli riservati non raggiungono chi non e' amministratore;
 *  - un modulo spento nasconde il pannello, ma moduli SCONOSCIUTI non svuotano
 *    il cruscotto (fail-open voluto);
 *  - le aree non concesse non aprono pannelli.
 *
 * Si esegue con: pnpm check:dashboard
 */

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { DASHBOARD_PANELS, PANEL_ORDER, visiblePanels, dashboardProfileLabel } from "../lib/platform/dashboard"
import { ALL_AREA_KEYS, BASELINE_AREA_KEYS } from "../lib/platform/areas"

const RADICE = process.cwd()
let passed = 0
let failed = 0

function check(nome: string, condizione: boolean, dettaglio = "") {
  if (condizione) {
    passed++
  } else {
    failed++
    console.log(`  FAIL  ${nome}${dettaglio ? " — " + dettaglio : ""}`)
  }
}

/** Un indirizzo /admin/x esiste se esiste la sua page.tsx (anche dinamica). */
function paginaEsiste(href: string): boolean {
  const parti = href.replace(/^\//, "").split("/")
  const diretto = join(RADICE, "app", ...parti, "page.tsx")
  if (existsSync(diretto)) return true

  // Il ripiego sul padre NON puo' essere "il padre ha una page.tsx": ogni
  // indirizzo sotto /admin/ passerebbe, perche' app/admin/page.tsx esiste, e il
  // controllo diventerebbe vacuo (verificato: /admin/todos-inesistente passava).
  // Si accetta solo il caso legittimo: la cartella dell'ultimo segmento esiste
  // davvero e la pagina e' resa da un gruppo di rotte o da un segmento dinamico.
  const cartella = join(RADICE, "app", ...parti)
  if (!existsSync(cartella)) return false
  return (
    existsSync(join(cartella, "page.jsx")) ||
    existsSync(join(cartella, "route.ts")) ||
    readdirSync(cartella).some(
      (v) => (v.startsWith("(") || v.startsWith("[")) && existsSync(join(cartella, v, "page.tsx")),
    )
  )
}

console.log("\n1. Ogni pannello e' disegnato da una card")
{
  const cards = readFileSync(join(RADICE, "components/admin/dashboard/dashboard-cards.tsx"), "utf8")
  for (const p of DASHBOARD_PANELS) {
    // La card usa uno switch su panel.id: se manca il ramo, cade nel default
    // che restituisce null e il pannello scompare senza dirlo.
    check(`card per "${p.id}"`, cards.includes(`case "${p.id}"`), "manca il ramo nello switch")
  }
}

console.log("\n2. Gli indirizzi dichiarati esistono")
for (const p of DASHBOARD_PANELS) {
  if (!p.href) continue
  check(`${p.id} -> ${p.href}`, paginaEsiste(p.href), "pagina inesistente")
}

console.log("\n3. Coerenza delle dichiarazioni")
{
  const visti = new Set<string>()
  for (const p of DASHBOARD_PANELS) {
    check(`id "${p.id}" unico`, !visti.has(p.id), "id duplicato")
    visti.add(p.id)
    check(`${p.id} ha una spiegazione`, p.hint.trim().length > 10, "hint troppo corto")
    check(`${p.id} ha una famiglia valida`, PANEL_ORDER.includes(p.kind), `kind sconosciuto: ${p.kind}`)
    if (p.area) {
      check(`${p.id} usa area "${p.area}"`, (ALL_AREA_KEYS as Set<string>).has(p.area), "chiave d'area sconosciuta")
    }
  }
}

console.log("\n3b. I pannelli che espongono il lavoro altrui restano riservati")
{
  // Elenco INCHIODATO a mano: sono i pannelli che mostrano dati di tutti, non
  // del singolo. Senza questo controllo, togliere `adminOnly` da uno di essi
  // passava inosservato (misurato: il sabotaggio restava verde), perche' le
  // altre prove verificano la coerenza delle dichiarazioni, non QUALI pannelli
  // devono essere dichiarati riservati.
  const SENSIBILI = ["per-person", "volumes", "presence", "system-health", "revenue", "leave-requests"]
  for (const id of SENSIBILI) {
    const p = DASHBOARD_PANELS.find((x) => x.id === id)
    check(`"${id}" esiste ancora fra i pannelli`, Boolean(p), "pannello rinominato o rimosso: aggiornare l'elenco")
    if (p) {
      check(
        `"${id}" e' dichiarato riservato`,
        p.adminOnly === true,
        "espone il lavoro o i conti di tutti: deve restare adminOnly",
      )
    }
  }
}

console.log("\n4. I pannelli riservati non raggiungono i membri")
{
  const tuttiIModuli = [...new Set(DASHBOARD_PANELS.map((p) => p.module).filter(Boolean))] as string[]
  const membro = {
    isAdmin: false,
    // Gli si concede OGNI area esistente: se anche cosi' vedesse un pannello
    // riservato, il difetto sarebbe nel filtro, non nei permessi.
    areas: [...(ALL_AREA_KEYS as Set<string>)],
    activeModules: tuttiIModuli,
  }
  const visti = visiblePanels(membro).map((p) => p.id)
  for (const p of DASHBOARD_PANELS.filter((x) => x.adminOnly)) {
    check(`"${p.id}" nascosto al membro`, !visti.includes(p.id), "pannello riservato visibile a un non-admin")
  }

  const admin = { isAdmin: true, areas: [], activeModules: tuttiIModuli }
  check(
    "l'amministratore vede tutti i pannelli",
    visiblePanels(admin).length === DASHBOARD_PANELS.length,
    `${visiblePanels(admin).length} su ${DASHBOARD_PANELS.length}`,
  )
}

console.log("\n5. Le aree non concesse non aprono pannelli")
{
  const tuttiIModuli = [...new Set(DASHBOARD_PANELS.map((p) => p.module).filter(Boolean))] as string[]
  // Membro senza NESSUNA concessione: vede solo cio' che e' baseline.
  const nudo = { isAdmin: false, areas: [], activeModules: tuttiIModuli }
  for (const p of visiblePanels(nudo)) {
    const ammesso = !p.area || BASELINE_AREA_KEYS.includes(p.area)
    check(`"${p.id}" ammesso senza concessioni`, ammesso, `richiede l'area "${p.area}" non baseline`)
    check(`"${p.id}" non e' riservato`, !p.adminOnly, "pannello riservato visibile senza permessi")
  }

  // Concedere una singola area apre esattamente i pannelli di quell'area.
  //
  // NON si usa "inbox": e' area BASELINE (spetta a tutti per progetto, come nel
  // menu), quindi concederla non cambia nulla e il confronto resterebbe verde
  // qualunque cosa faccia il motore. Una prova che non puo' fallire non prova
  // niente. Si scelgono solo aree davvero concedibili, e si verifica che
  // esistano nel catalogo invece di fidarsi del nome che ho in mente.
  const concedibili = [...new Set(DASHBOARD_PANELS.map((p) => p.area).filter(Boolean))]
    .filter((k) => !BASELINE_AREA_KEYS.includes(k as string))
    // ALL_AREA_KEYS e' un Set, non un array: `.includes` non esiste.
    .filter((k) => ALL_AREA_KEYS.has(k as string)) as string[]

  check("esiste almeno un'area concedibile fra i pannelli", concedibili.length > 0, "nessuna area da discriminare")

  for (const area of concedibili) {
    const con = { isAdmin: false, areas: [area], activeModules: tuttiIModuli }
    const delta = visiblePanels(con)
      .map((p) => p.id)
      .filter((id) => !visiblePanels(nudo).some((p) => p.id === id))
    const attesi = DASHBOARD_PANELS.filter((p) => p.area === area && !p.adminOnly).map((p) => p.id)
    check(
      `concedere "${area}" apre esattamente i suoi pannelli`,
      delta.length === attesi.length && delta.every((id) => attesi.includes(id)),
      `apparsi: [${delta.join(", ")}] attesi: [${attesi.join(", ")}]`,
    )
  }
}

console.log("\n6. Moduli: spento nasconde, sconosciuto non svuota")
{
  const conHr = {
    isAdmin: true,
    areas: [],
    activeModules: DASHBOARD_PANELS.map((p) => p.module).filter(Boolean) as string[],
  }
  const senzaHr = { ...conHr, activeModules: conHr.activeModules.filter((m) => m !== "hr") }
  const perse = visiblePanels(conHr)
    .map((p) => p.id)
    .filter((id) => !visiblePanels(senzaHr).some((p) => p.id === id))
  const attesePerse = DASHBOARD_PANELS.filter((p) => p.module === "hr").map((p) => p.id)
  check(
    "spegnere hr nasconde esattamente i pannelli hr",
    perse.length === attesePerse.length && perse.every((id) => attesePerse.includes(id)),
    `scomparsi: [${perse.join(", ")}] attesi: [${attesePerse.join(", ")}]`,
  )

  // Fail-open: elenco moduli non ancora noto (null) NON deve svuotare la pagina.
  const senzaNotizie = { isAdmin: true, areas: [], activeModules: null }
  check(
    "moduli ignoti: il cruscotto resta pieno (fail-open)",
    visiblePanels(senzaNotizie).length === DASHBOARD_PANELS.length,
    `${visiblePanels(senzaNotizie).length} su ${DASHBOARD_PANELS.length}`,
  )
}

console.log("\n7. L'etichetta del profilo non contraddice il contenuto")
{
  check(
    "amministratore -> Direzione",
    dashboardProfileLabel({ isAdmin: true, areas: [], activeModules: [] }) === "Direzione",
  )
  check(
    "inbox + telefono -> Ricevimento",
    dashboardProfileLabel({ isAdmin: false, areas: ["inbox", "calls"], activeModules: [] }) === "Ricevimento",
  )
  // Un non-admin non puo' MAI essere etichettato Direzione: sarebbe una promessa
  // che il contenuto smentisce.
  const etichette = [
    dashboardProfileLabel({ isAdmin: false, areas: [], activeModules: [] }),
    dashboardProfileLabel({ isAdmin: false, areas: ["hr"], activeModules: [] }),
    dashboardProfileLabel({ isAdmin: false, areas: [...(ALL_AREA_KEYS as Set<string>)], activeModules: [] }),
  ]
  check("nessun membro etichettato Direzione", !etichette.includes("Direzione"), etichette.join(" / "))
}

console.log(`\nRisultato: ${passed} passate, ${failed} fallite\n`)
process.exit(failed === 0 ? 0 : 1)
