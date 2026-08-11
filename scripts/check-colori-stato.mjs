/**
 * Conta i colori Tailwind scritti a mano nel backend e li divide in due
 * famiglie, perche' NON sono lo stesso problema:
 *
 *   STATO  - il colore dice "va bene / attenzione / errore / informazione".
 *            Deve passare ai token semantici: cambia col tema, resta
 *            leggibile al buio, ed e' coerente con Santaddeo.
 *
 *   DATO   - il colore E' l'informazione: l'azzurro di Telegram, il verde di
 *            WhatsApp, il viola del livello "platinum", il colore di una
 *            categoria. Convertirlo cancellerebbe cio' che distingue una
 *            voce dall'altra. Va LASCIATO.
 *
 * La distinzione non e' a occhio: un colore e' DATO quando sta dentro una
 * struttura dati (`color: "bg-sky-500"`), cioe' quando e' un valore
 * associato a un'entita', non una scelta di stile nel markup.
 */
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const TAVOLOZZA = "red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose"
const COLORE = new RegExp(`\\b(?:bg|text|border|ring|hover:bg|hover:text|from|to)-(?:${TAVOLOZZA})-\\d{2,3}`)

// Una riga e' DATO quando il colore e' il valore di una proprieta' di un
// oggetto: color:, iconColor:, badgeColor: ... Li' il colore e' un campo.
const E_DATO = /^\s*(?:color|colour|bgColor|iconColor|dotColor|badgeColor|textColor|ringColor)\s*:/

const file = execSync('git ls-files "app/admin/**/*.tsx"', { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)

let stato = 0
let dato = 0
const esempiStato = []
const esempiDato = []

for (const f of file) {
  const righe = readFileSync(resolve(ROOT, f), "utf8").split("\n")
  righe.forEach((riga, i) => {
    if (!COLORE.test(riga)) return
    const dove = `${f.replace("app/admin/", "")}:${i + 1}`
    if (E_DATO.test(riga)) {
      dato++
      if (esempiDato.length < 6) esempiDato.push(`${dove}  ${riga.trim().slice(0, 70)}`)
    } else {
      stato++
      if (esempiStato.length < 10) esempiStato.push(`${dove}  ${riga.trim().slice(0, 70)}`)
    }
  })
}

console.log(`  file esaminati: ${file.length}`)
console.log(`  colori di STATO (da portare sui token) : ${stato}`)
console.log(`  colori-DATO     (da lasciare come sono): ${dato}`)

if (esempiStato.length) {
  console.log("\n  esempi di STATO:")
  esempiStato.forEach((e) => console.log(`    ${e}`))
}
if (esempiDato.length) {
  console.log("\n  esempi di DATO:")
  esempiDato.forEach((e) => console.log(`    ${e}`))
}
