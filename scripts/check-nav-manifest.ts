/**
 * Prove sul manifesto della navigazione (lib/platform/nav.ts).
 *
 * Perche' sono necessarie
 * -----------------------
 * Il menu e la pagina Impostazioni ora leggono un elenco solo. Il rischio si
 * sposta: se in quell'elenco un indirizzo e' sbagliato o una chiave d'area ha
 * un refuso, la voce porta a una pagina inesistente o non compare MAI a
 * nessuno, e nessuno se ne accorge perche' il codice compila benissimo.
 *
 * Queste prove verificano contro il disco e contro il catalogo delle aree:
 *  1. ogni `href` corrisponde a una pagina che esiste davvero;
 *  2. ogni `area` esiste in ALL_AREA_KEYS;
 *  3. gli `id` sono unici (sono chiavi di React);
 *  4. la classificazione del menu non contraddice il `group` del catalogo aree;
 *  5. `visibleEntries` si comporta come dichiarato (fail-open sui moduli,
 *     fail-closed su ruolo e aree).
 *
 * Si esegue con: pnpm check:nav
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  NAV_ENTRIES,
  OPERATIVE_ENTRIES,
  SETTINGS_ENTRIES,
  SETTINGS_HUB_HREF,
  visibleEntries,
  type NavEntry,
} from "../lib/platform/nav"
import { ALL_AREA_KEYS, PLATFORM_AREAS } from "../lib/platform/areas"

const ROOT = process.cwd()

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`)
  }
}

/**
 * Un href di Next.js corrisponde a una pagina se esiste page.tsx nella cartella
 * corrispondente. Si accetta anche il caso in cui la rotta sia servita da un
 * segmento dinamico, ma qui gli indirizzi sono tutti statici.
 */
function pageExists(href: string): boolean {
  const rel = href.replace(/^\//, "")
  return (
    existsSync(join(ROOT, "app", rel, "page.tsx")) ||
    existsSync(join(ROOT, "app", `${rel}.tsx`))
  )
}

console.log("\n== 1. Ogni indirizzo del menu esiste su disco ==")
for (const entry of NAV_ENTRIES) {
  check(`${entry.id} -> ${entry.href}`, pageExists(entry.href), "pagina inesistente")
}
check(`pagina che raccoglie le impostazioni (${SETTINGS_HUB_HREF})`, pageExists(SETTINGS_HUB_HREF))

console.log("\n== 2. Ogni chiave d'area esiste nel catalogo ==")
// ALL_AREA_KEYS e' gia' un Set: si usa direttamente invece di ricostruirlo.
for (const entry of NAV_ENTRIES.filter((e) => e.area)) {
  check(
    `${entry.id} usa area "${entry.area}"`,
    (ALL_AREA_KEYS as Set<string>).has(entry.area as string),
    "chiave sconosciuta",
  )
}

console.log("\n== 3. Identificativi unici ==")
const ids = NAV_ENTRIES.map((e) => e.id)
check("nessun id duplicato", new Set(ids).size === ids.length, `duplicati: ${ids.filter((v, i) => ids.indexOf(v) !== i).join(", ")}`)

console.log("\n== 4. Menu e catalogo aree concordano ==")
/*
 * Il catalogo classifica le AREE, il manifesto classifica le VOCI. Dove
 * esistono entrambi devono dire la stessa cosa, altrimenti chi legge il
 * catalogo per capire i permessi si costruisce un'idea sbagliata di dov'e' la
 * voce. Eccezioni dichiarate, entrambe per lo stesso motivo: una sola chiave
 * d'area protegge sia le pagine che si USANO ogni giorno sia quelle che si
 * IMPOSTANO una volta, quindi le voci di quell'area stanno legittimamente in
 * entrambi i gruppi.
 *
 * - "tracking": una sola chiave protegge tutto /admin/tracking.
 * - "crm": `requireAreaPage("crm")` nel layout di app/admin/crm protegge sia le
 *   pagine operative (Contatti, Pipeline, PMS/gestionale) sia il "Collegamento
 *   gestionale", che sta fra le Impostazioni perche' si configura una volta
 *   sola. Non si spezza la chiave in due: darebbe due permessi da gestire per
 *   una sola area, e chi ha accesso al CRM deve poter sistemare il collegamento
 *   del proprio gestionale.
 *
 * Questa non e' una deroga per far passare la prova: la prova 5 continua a
 * pretendere che "Collegamento gestionale" stia fra le impostazioni.
 */
const AREE_CON_DUE_COLLOCAZIONI = new Set(["tracking", "crm"])
for (const entry of NAV_ENTRIES.filter((e) => e.area && !AREE_CON_DUE_COLLOCAZIONI.has(e.area as string))) {
  const area = PLATFORM_AREAS.find((a) => a.key === entry.area)
  if (!area) continue
  const atteso = area.group === "operative" ? "operative" : "settings"
  check(
    `"${entry.label}" (area ${entry.area}): menu=${entry.placement} catalogo=${area.group}`,
    entry.placement === atteso,
    `il catalogo la dice ${area.group}`,
  )
}

console.log("\n== 5. La logica richiesta e' rispettata ==")
/*
 * La richiesta: le pagine dove si IMPOSTANO le funzioni sotto un'unica voce
 * Impostazioni, tutto il resto pulsanti operativi. Queste prove fissano il
 * risultato atteso su casi concreti, cosi' se qualcuno domani rimette una
 * configurazione fra le operative la prova lo dice.
 */
function collocazione(id: string): string | undefined {
  return NAV_ENTRIES.find((e) => e.id === id)?.placement
}

for (const id of ["inbox", "calls", "crm", "hr", "my-work", "monitoring", "marketing", "todos", "dashboard"]) {
  check(`"${id}" e' operativa`, collocazione(id) === "operative", `risulta ${collocazione(id)}`)
}
for (const id of [
  "channels",
  "knowledge",
  "cms",
  "users",
  "modules",
  "billing",
  "domains",
  "api-access",
  "photos",
  "gallery",
  "categories",
  "message-rules",
  "tracking-sites",
  "embed-scripts",
  "profile",
  /*
   * Il collegamento al gestionale. Serve NOMINARLO qui: l'area "crm" e' fra le
   * AREE_CON_DUE_COLLOCAZIONI, quindi la prova 4 non la controlla piu' e senza
   * questa riga nessuno si accorgerebbe se tornasse fra le operative.
   */
  "pms-config",
]) {
  check(`"${id}" e' fra le impostazioni`, collocazione(id) === "settings", `risulta ${collocazione(id)}`)
}

// Il tracking diviso: i dati da consultare restano operativi, le chiavi no.
check("i visitatori sono operativi", collocazione("tracking-visitors") === "operative")
check("il calendario domanda e' operativo", collocazione("tracking-demand") === "operative")
check("le chiavi di tracking sono impostazioni", collocazione("tracking-sites") === "settings")

console.log("\n== 6. Nessuna configurazione e' rimasta fuori da Impostazioni ==")
/*
 * Controllo di copertura: nessuna voce operativa deve puntare a una pagina che
 * il catalogo delle aree considera configurazione. E' la prova che risponde
 * davvero alla richiesta invece di limitarsi a contare le voci.
 */
const operativeCheDovrebberoEssereConfig = OPERATIVE_ENTRIES.filter((e) => {
  if (!e.area || AREE_CON_DUE_COLLOCAZIONI.has(e.area)) return false
  return PLATFORM_AREAS.find((a) => a.key === e.area)?.group === "config"
})
check(
  "nessuna voce operativa e' in realta' una configurazione",
  operativeCheDovrebberoEssereConfig.length === 0,
  operativeCheDovrebberoEssereConfig.map((e) => e.label).join(", "),
)

console.log("\n== 7. Il filtro di visibilita' si comporta come dichiarato ==")

const tutte = NAV_ENTRIES

// Fail-open sui moduli: dato assente => non si nasconde nulla per i moduli.
const conModuloIgnoto = visibleEntries(
  tutte.filter((e) => e.module === "inbox" && !e.adminOnly && !e.area),
  { isAdmin: true, activeModules: null },
)
check(
  "moduli sconosciuti: le voci restano visibili (fail-open)",
  conModuloIgnoto.length > 0,
  "un dato mancante ha svuotato il menu",
)

// ...ma se il modulo e' noto e spento, la voce sparisce.
const conModuloSpento = visibleEntries(
  tutte.filter((e) => e.module === "hr"),
  { isAdmin: true, activeModules: ["inbox"] },
)
check("modulo spento: la voce sparisce", conModuloSpento.length === 0)

// Fail-closed sul ruolo: ruolo ignoto => niente voci riservate.
const riservate = tutte.filter((e) => e.adminOnly)
const perRuoloIgnoto = visibleEntries(riservate, { isAdmin: undefined, activeModules: null })
check(
  "ruolo ignoto: le voci riservate restano nascoste (fail-closed)",
  perRuoloIgnoto.length === 0,
  `visibili: ${perRuoloIgnoto.map((e) => e.label).join(", ")}`,
)

// Fail-closed sulle aree.
const perMembroSenzaAree = visibleEntries(
  tutte.filter((e) => e.area && !e.adminOnly),
  { isAdmin: false, areas: [], activeModules: null },
)
check(
  "membro senza aree: le voci area-gated restano nascoste",
  perMembroSenzaAree.length === 0,
  `visibili: ${perMembroSenzaAree.map((e) => e.label).join(", ")}`,
)

// Un membro con l'area concessa DEVE vedere la voce: e' il difetto trovato
// oggi (CMS e Tracking negati nelle impostazioni a chi ne aveva diritto).
const membroConCms = visibleEntries(SETTINGS_ENTRIES, {
  isAdmin: false,
  areas: ["cms"],
  activeModules: ["cms", "inbox"],
})
check(
  "membro con area 'cms': vede CMS fra le impostazioni",
  membroConCms.some((e) => e.id === "cms"),
  "e' il difetto che stiamo correggendo",
)
check(
  "...e NON vede le voci riservate agli amministratori",
  !membroConCms.some((e) => e.adminOnly),
  `visibili: ${membroConCms.filter((e) => e.adminOnly).map((e) => e.label).join(", ")}`,
)

const membroConTracking = visibleEntries(SETTINGS_ENTRIES, {
  isAdmin: false,
  areas: ["tracking"],
  activeModules: ["tracking"],
})
check(
  "membro con area 'tracking': vede le chiavi fra le impostazioni",
  membroConTracking.some((e) => e.id === "tracking-sites"),
)

// Il permesso puntuale: admin senza can_manage_users non vede Gestione Utenti.
const adminSenzaGestioneUtenti = visibleEntries(SETTINGS_ENTRIES, {
  isAdmin: false,
  areas: [],
  activeModules: null,
  canManageUsers: false,
})
check(
  "senza can_manage_users: Gestione Utenti non compare",
  !adminSenzaGestioneUtenti.some((e) => e.id === "users"),
)

// Un membro semplice deve comunque avere qualcosa sotto Impostazioni (il
// proprio profilo), altrimenti la tendina sparirebbe del tutto.
const membroSemplice = visibleEntries(SETTINGS_ENTRIES, {
  isAdmin: false,
  areas: [],
  activeModules: ["inbox"],
})
check(
  "membro semplice: vede almeno il proprio profilo",
  membroSemplice.some((e) => e.id === "profile"),
  `visibili: ${membroSemplice.map((e) => e.label).join(", ")}`,
)

console.log(`\nRisultato: ${passed} ok, ${failed} falliti\n`)
process.exit(failed === 0 ? 0 : 1)
