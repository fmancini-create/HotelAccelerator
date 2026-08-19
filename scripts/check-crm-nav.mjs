// Verifica che la barra delle sezioni CRM sia un indice COMPLETO dell'area:
// ogni cartella con una page.tsx sotto app/admin/crm deve avere una voce, e ogni
// voce deve puntare a una pagina che esiste davvero.
//
// Perche' esiste: la barra e' nata elencando 7 sezioni su 9 (mancavano pms-sync e
// settings). Un menu incompleto fa sembrare mancante un pezzo di prodotto che c'e';
// un menu che offre una pagina inesistente porta l'utente su un 404.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const RADICE = "app/admin/crm"
const BARRA = "components/crm/crm-workspace-nav.tsx"
let errori = 0
const rosso = (m) => {
  console.log("  ROSSO: " + m)
  errori++
}

const sorgente = readFileSync(BARRA, "utf8")

// Voci dichiarate nella barra: href e etichetta.
const voci = [...sorgente.matchAll(/href:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"/g)].map((m) => ({
  href: m[1],
  label: m[2],
}))
if (voci.length === 0) rosso("nessuna voce trovata nella barra: il formato del file e' cambiato")

// Sezioni reali sul disco: una cartella conta solo se ha una page.tsx.
const sezioni = readdirSync(RADICE)
  .filter((n) => {
    try {
      return statSync(join(RADICE, n)).isDirectory()
    } catch {
      return false
    }
  })
  .filter((n) => {
    try {
      statSync(join(RADICE, n, "page.tsx"))
      return true
    } catch {
      return false
    }
  })

// 1. ogni sezione reale ha una voce
for (const s of sezioni) {
  const atteso = `/admin/crm/${s}`
  if (!voci.some((v) => v.href === atteso)) {
    rosso(`la sezione "${s}" esiste ma non e' elencata nella barra (${atteso})`)
  }
}

// 2. ogni voce punta a una pagina esistente
for (const v of voci) {
  if (v.href === "/admin/crm") continue // la radice ha la sua page.tsx
  const cartella = v.href.replace("/admin/crm/", "")
  if (!sezioni.includes(cartella)) {
    rosso(`la voce "${v.label}" punta a ${v.href}, che in questo ramo non ha una page.tsx: porterebbe a un 404. Se la pagina arriva da main (contacts, pms-sync), aggiorna il ramo con main; altrimenti togli la voce.`)
  }
}

// 3. etichette non vuote e senza sequenze \u lasciate letterali (errore gia' commesso)
for (const v of voci) {
  if (!v.label.trim()) rosso(`voce con etichetta vuota: ${v.href}`)
  if (/u00[0-9a-f]{2}/i.test(v.label)) rosso(`etichetta con sequenza \\u letterale: "${v.label}"`)
}

// 4. la larghezza misurata a schermo era 1114px per 9 voci su viewport 1162: oltre
// una certa somma di caratteri la barra tracima e l'ultima voce viene tagliata.
// Non sostituisce la verifica a schermo, ma impedisce la regressione silenziosa.
const caratteri = voci.reduce((n, v) => n + v.label.length, 0)
const LIMITE = 95
if (caratteri > LIMITE) {
  rosso(`etichette troppo lunghe in totale (${caratteri} caratteri, limite ${LIMITE}): la barra tracima e l'ultima voce viene tagliata`)
}

console.log(`  voci: ${voci.length}  sezioni su disco: ${sezioni.length}  caratteri etichette: ${caratteri}`)
console.log(errori === 0 ? "  VERDE: la barra CRM e' un indice completo" : `  ${errori} problemi`)
process.exit(errori === 0 ? 0 : 1)
