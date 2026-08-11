/**
 * Porta sui token semantici i colori di STATO del backend.
 *
 * Perche' serve: `text-green-700` e' un colore fisso. Al buio resta scuro su
 * fondo scuro, e non segue il tema. `text-ha-success-soft-foreground` e' lo
 * stesso verde di giorno, ma si schiarisce da solo di notte.
 *
 * COSA NON TOCCA, di proposito:
 *  - i colori-DATO (`color: "bg-sky-500"`): li' il colore E' l'informazione,
 *    convertirlo renderebbe Telegram e WhatsApp indistinguibili;
 *  - le righe con un marchio di terzi (Google, Meta, WhatsApp...): quei
 *    colori sono identita' altrui, non nostre scelte di stile;
 *  - viola / rosa / verdeacqua: NON esiste un token corrispondente, e
 *    inventarne uno significherebbe forzare un significato che non c'e'.
 *    Restano scritti a mano, e il controllo li segnala come residui veri.
 */
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// Quale famiglia Tailwind corrisponde a quale significato.
const SIGNIFICATO = {
  green: "success",
  emerald: "success",
  amber: "warning",
  yellow: "warning",
  orange: "warning",
  red: "error",
  blue: "info",
  sky: "info",
  cyan: "info",
  indigo: "info",
}

const E_DATO = /^\s*(?:color|colour|bgColor|iconColor|dotColor|badgeColor|textColor|ringColor)\s*:/
const E_MARCHIO = /google|whatsapp|telegram|meta|facebook|instagram|linkedin|booking\.com/i

/**
 * La tonalita' decide la VARIANTE del token, non il colore.
 * 50-200  = superficie tenue      -> -soft
 * 400-900 su testo = testo scuro  -> -soft-foreground  (leggibile su tenue)
 * 400-900 su fondo = pieno        -> token pieno
 */
function variante(prefisso, tono, sem) {
  const n = Number(tono)
  const testo = prefisso === "text" || prefisso === "hover:text" || prefisso === "group-hover:text"
  const bordo = prefisso === "border" || prefisso === "ring" || prefisso === "divide"

  if (testo) {
    // Testo chiaro (100/200) sta su un pieno: gli serve il colore "sopra il pieno".
    if (n <= 200) return `ha-${sem}-foreground`
    return `ha-${sem}-soft-foreground`
  }
  if (bordo) return n <= 300 ? `ha-${sem}-soft` : `ha-${sem}`
  // fondi e gradienti
  return n <= 200 ? `ha-${sem}-soft` : `ha-${sem}`
}

const famiglie = Object.keys(SIGNIFICATO).join("|")
const RE = new RegExp(`\\b(bg|text|border|ring|divide|hover:bg|hover:text|group-hover:text|from|to)-(${famiglie})-(\\d{2,3})(\\/\\d{1,3})?\\b`, "g")

const file = execSync('git ls-files "app/admin/**/*.tsx"', { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)

let totale = 0
const toccati = []

for (const f of file) {
  const percorso = resolve(ROOT, f)
  const righe = readFileSync(percorso, "utf8").split("\n")
  let n = 0

  const nuove = righe.map((riga) => {
    if (E_DATO.test(riga)) return riga // il colore e' un dato
    if (E_MARCHIO.test(riga)) return riga // identita' di terzi
    return riga.replace(RE, (intero, prefisso, famiglia, tono, opacita) => {
      const sem = SIGNIFICATO[famiglia]
      if (!sem) return intero
      n++
      return `${prefisso}-${variante(prefisso, tono, sem)}${opacita || ""}`
    })
  })

  if (n > 0) {
    writeFileSync(percorso, nuove.join("\n"))
    totale += n
    toccati.push(`${String(n).padStart(4)}  ${f.replace("app/admin/", "")}`)
  }
}

console.log(`  sostituzioni: ${totale}`)
console.log(`  file toccati: ${toccati.length}`)
toccati.sort((a, b) => Number(b.trim().split(" ")[0]) - Number(a.trim().split(" ")[0]))
toccati.slice(0, 15).forEach((t) => console.log(`  ${t}`))
