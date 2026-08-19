// Prova che `check:crm-nav` SA FALLIRE.
//
// Perche' esiste: un presidio verde non dimostra niente se non lo si vede
// arrossire. Qui il difetto viene reintrodotto a mano, uno per volta, e la prova
// pretende che il presidio lo colga; poi il file viene ripristinato identico.
//
// La guardia sull'applicazione e' la parte importante: se una sostituzione non
// cambia il file (riga inventata, refactoring che ha spostato il codice) il
// sabotaggio non e' mai arrivato al presidio, e un "colto: 0/0" sembrerebbe un
// successo. In quel caso la prova diventa rossa da sé.
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const FILE = "components/crm/crm-workspace-nav.tsx"
const originale = readFileSync(FILE, "utf8")

const sabotaggi = [
  ["voce Chiamate rimossa (sezione senza voce)", (s) => s.replace(/\{\s*href:\s*"\/admin\/crm\/calls",[^}]*\},?\n/, "")],
  ["voce Impostazioni rimossa", (s) => s.replace(/\{\s*href:\s*"\/admin\/crm\/settings",[^}]*\},?\n/, "")],
  ["voce PMS rimossa", (s) => s.replace(/\{\s*href:\s*"\/admin\/crm\/pms-sync",[^}]*\},?\n/, "")],
  ["voce verso una pagina inesistente (404)", (s) => s.replace(/href:\s*"\/admin\/crm\/calls"/, 'href: "/admin/crm/inesistente"')],
  ["etichetta vuota", (s) => s.replace(/label:\s*"Chiamate"/, 'label: ""')],
  ["sequenza \\u lasciata letterale", (s) => s.replace(/label:\s*"Attività"/, 'label: "Attivit\\u00e0"')],
  ["etichette che fanno tracimare la barra", (s) => s.replace(/label:\s*"Dashboard"/, 'label: "Dashboard commerciale completa della struttura"')],
]

let applicati = 0
let colti = 0
let problemi = 0

for (const [nome, muta] of sabotaggi) {
  const modificato = muta(originale)
  if (modificato === originale) {
    console.log(`  NON APPLICATO: ${nome} — la riga cercata non esiste piu' in ${FILE}: aggiorna questo sabotaggio`)
    problemi++
    continue
  }
  applicati++
  writeFileSync(FILE, modificato)
  let uscita = 0
  try {
    execSync("node scripts/check-crm-nav.mjs", { stdio: "pipe" })
  } catch (e) {
    uscita = e.status || 1
  }
  writeFileSync(FILE, originale)
  if (uscita !== 0) {
    colti++
    console.log(`  COLTO    -> ${nome}`)
  } else {
    console.log(`  SFUGGITO -> ${nome}`)
    problemi++
  }
}

// Il file deve tornare esattamente com'era, anche se qualcosa e' andato storto.
if (readFileSync(FILE, "utf8") !== originale) {
  writeFileSync(FILE, originale)
  console.log("  ROSSO: il file era stato lasciato modificato (ora ripristinato)")
  problemi++
}

console.log(`\n  dichiarati: ${sabotaggi.length}  applicati: ${applicati}  colti: ${colti}`)
console.log(problemi === 0 ? "  VERDE: il presidio sa fallire su ogni difetto noto" : `  ${problemi} problemi`)
process.exit(problemi === 0 ? 0 : 1)
