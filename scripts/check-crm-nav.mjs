// Verifica che la barra delle sezioni CRM sia un indice COMPLETO dell'area:
// ogni cartella con una page.tsx sotto app/admin/crm deve avere una voce, e ogni
// voce deve puntare a una pagina che esiste davvero.
//
// Perche' esiste: la barra e' nata elencando 7 sezioni su 9 (mancavano pms-sync e
// settings). Un menu incompleto fa sembrare mancante un pezzo di prodotto che c'e';
// un menu che offre una pagina inesistente porta l'utente su un 404.
//
// Una sezione puo' essere raggiungibile DALLA BARRA oppure DALLE IMPOSTAZIONI
// (manifesto lib/platform/nav.ts). Le due porte valgono uguale, ma almeno una
// deve esserci: "Collegamento gestionale" vive fra le impostazioni perche' si
// configura una volta sola, e la barra apre invece il gestionale, che si usa
// ogni giorno. Se qualcuno togliesse quella voce dalle impostazioni, la pagina
// resterebbe senza nessuna porta e questa prova arrossisce.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const RADICE = "app/admin/crm"
const BARRA = "components/crm/crm-workspace-nav.tsx"
const MANIFESTO = "lib/platform/nav.ts"

/** Toglie i commenti: la prosa che SPIEGA una regola non deve far scattare la regola. */
const senzaCommenti = (testo) =>
  testo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((riga) => riga.replace(/\/\/.*$/, ""))
    .join("\n")
let errori = 0
const rosso = (m) => {
  console.log("  ROSSO: " + m)
  errori++
}

const sorgente = senzaCommenti(readFileSync(BARRA, "utf8"))

// Sezioni CRM raggiungibili dalla pagina Impostazioni: si prende l'href solo se
// nella stessa voce compare `placement: "settings"`, altrimenti conterei anche
// le voci operative.
const manifesto = senzaCommenti(readFileSync(MANIFESTO, "utf8"))
const daImpostazioni = new Set(
  [...manifesto.matchAll(/href:\s*"(\/admin\/crm[^"]*)"([\s\S]{0,400}?)(?=\n\s{2}\{|\n\]|$)/g)]
    .filter((m) => /placement:\s*"settings"/.test(m[2]))
    .map((m) => m[1]),
)

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

// 1. ogni sezione reale ha una porta: la barra OPPURE le impostazioni.
for (const s of sezioni) {
  const atteso = `/admin/crm/${s}`
  const nellaBarra = voci.some((v) => v.href === atteso)
  const nelleImpostazioni = daImpostazioni.has(atteso)
  if (!nellaBarra && !nelleImpostazioni) {
    rosso(
      `la sezione "${s}" esiste (${atteso}) ma non e' raggiungibile da nessuna parte: ` +
        `non e' nella barra CRM e non e' fra le voci "settings" del manifesto ${MANIFESTO}`,
    )
  }
}

// 2. ogni voce della barra punta a una pagina che esiste davvero, anche annidata.
for (const v of voci) {
  if (v.href === "/admin/crm") continue // la radice ha la sua page.tsx
  const relativo = v.href.replace("/admin/crm/", "")
  // Il percorso puo' avere piu' segmenti (es. pms-sync/gestionale): si controlla
  // la page.tsx dove punta il link, non solo la cartella di primo livello.
  if (!existsSync(join(RADICE, relativo, "page.tsx"))) {
    rosso(
      `la voce "${v.label}" punta a ${v.href}, che non ha una page.tsx: porterebbe a un 404. ` +
        `Se la pagina arriva da main, aggiorna il ramo con main; altrimenti correggi il link.`,
    )
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

console.log(
  `  voci barra: ${voci.length}  sezioni su disco: ${sezioni.length}` +
    `  sezioni da Impostazioni: ${daImpostazioni.size}  caratteri etichette: ${caratteri}`,
)
console.log(errori === 0 ? "  VERDE: la barra CRM e' un indice completo" : `  ${errori} problemi`)
process.exit(errori === 0 ? 0 : 1)
