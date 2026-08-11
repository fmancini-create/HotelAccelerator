/**
 * GUARDIA DEL TEMA (standard grafico Santaddeo).
 *
 * Regola del gruppo 4BID: ogni prodotto usa il tema neutro chiaro di
 * Santaddeo, con i colori applicati per SIGNIFICATO tramite token semantici
 * (--ha-brand, --ha-success, --ha-warning, --ha-error, --ha-info) e mai
 * scritti a mano.
 *
 * Conta i RESIDUI, non le sostituzioni riuscite: un controllo che conta i
 * propri successi da' verde anche quando ha saltato un intero file, ed e'
 * esattamente cosi' che il footer era rimasto indietro.
 *
 *   node scripts/check-theme-tokens.mjs
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const TAVOLOZZA =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"

const CLASSE = new RegExp(
  `(?<![\\w-])(bg|text|border|ring|divide|from|via|to|placeholder|fill|stroke|shadow)-(${TAVOLOZZA})-[0-9]{2,3}(\\/[0-9]{1,3})?(?![\\w-])`,
  "g",
)

/**
 * Aree sotto la regola. I siti dei clienti (santaddeo, barronci) hanno un
 * tema proprio e restano fuori.
 */
const AREE = [
  { nome: "pagine pubbliche", prefisso: "app/(platform)/" },
  { nome: "componenti pubblici", prefisso: "components/platform" },
]

/**
 * ECCEZIONI LEGITTIME, una per riga e con il motivo.
 *
 * Non sono sviste: sono punti in cui un colore scritto a mano porta
 * informazione o e' una scelta deliberata. Vanno tenute corte e motivate,
 * altrimenti diventano un modo per far tacere la guardia.
 */
const ECCEZIONI = [
  // Blocchi volutamente scuri: riquadri di codice, pannelli diagnostici,
  // barre in stile terminale. Li' il fondo scuro E' il progetto.
  { quando: (riga) => /bg-gray-900|bg-slate-900|bg-black\b/.test(riga), motivo: "blocco volutamente scuro" },
  // Colori-DATO: pastiglie di categoria e pallini di priorita'. Il colore
  // distingue le voci, quindi convertirlo cancellerebbe l'informazione.
  { quando: (riga) => /\b(color|dot|badge|swatch)\s*:/.test(riga), motivo: "colore-dato, non cromatura" },
  // Marchi di terze parti: Google, Meta, WhatsApp hanno colori propri.
  { quando: (riga) => /google|whatsapp|telegram|meta|facebook|instagram/i.test(riga), motivo: "colore di marchio terzo" },
  // Stelle di valutazione in ambra. Non e' una deroga di comodo: Santaddeo,
  // che e' la fonte di verita', scrive a mano text-amber-400 in 14 punti.
  // Bocciarle qui significherebbe applicare al prodotto una regola piu'
  // severa di quella che lo standard segue davvero.
  { quando: (riga) => /Star/.test(riga) && /amber|yellow/.test(riga), motivo: "stella di valutazione, come in Santaddeo" },
]

const file = execSync("git ls-files 'app/**/*.tsx' 'components/**/*.tsx'", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !/apps\/santaddeo|components\/barronci/.test(f))

let problemi = 0
let coperte = 0

for (const area of AREE) {
  const suoi = file.filter((f) => f.startsWith(area.prefisso))
  const trovati = []

  for (const f of suoi) {
    const righe = readFileSync(`${ROOT}/${f}`, "utf8").split("\n")
    righe.forEach((riga, i) => {
      const occorrenze = riga.match(CLASSE)
      if (!occorrenze) return
      const scusa = ECCEZIONI.find((e) => e.quando(riga))
      if (scusa) {
        coperte += occorrenze.length
        return
      }
      trovati.push([f, i + 1, occorrenze.join(" ")])
    })
  }

  console.log(`  ${area.nome}: ${suoi.length} file, ${trovati.length} righe con colori scritti a mano`)
  for (const [f, n, che] of trovati.slice(0, 15)) {
    console.log(`    ${f}:${n}  ${che}`)
  }
  if (trovati.length > 15) console.log(`    ... e altre ${trovati.length - 15}`)
  problemi += trovati.length
}

console.log(`  eccezioni legittime coperte: ${coperte}`)

if (problemi === 0) {
  console.log("  OK — nessun colore scritto a mano fuori dai token.")
  process.exit(0)
}
process.exit(1)
