#!/usr/bin/env node
/**
 * Controllo di copertura della guardia di area.
 *
 * Verifica DUE cose che, se restano implicite, fanno sembrare protetto un
 * sistema che non lo e':
 *
 *  1. ROTTE NON CLASSIFICATE — una rotta API che non e' ne' pubblica, ne' da
 *     super admin, ne' presente nella mappa area. Non riceve alcun controllo
 *     di sezione, e nessuno se ne accorge finche' non capita qualcosa.
 *
 *  2. ROTTE NON OSSERVATE — una rotta che chiama gli aiutanti di
 *     autenticazione SENZA passare la richiesta. Senza richiesta non c'e'
 *     percorso, quindi la guardia non puo' sapere quale area sia: passa
 *     sempre. E' il caso peggiore, perche' il presidio risulta attivo ma su
 *     quella rotta non decide nulla.
 *
 * Esce con codice 1 se la copertura peggiora rispetto alla soglia registrata,
 * cosi' una rotta nuova non puo' entrare senza essere classificata.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const RADICE_API = "app/api"

// Soglie: fotografia dello stato al momento in cui il controllo e' nato.
// Vanno ABBASSATE quando si sistema qualcosa, mai alzate per far passare il
// controllo. Un numero alzato in silenzio trasforma il presidio in un timbro.
const MAX_NON_CLASSIFICATE = 0
const MAX_NON_OSSERVATE = 15

function trovaRotte(dir, acc = []) {
  for (const voce of readdirSync(dir)) {
    const percorso = join(dir, voce)
    if (statSync(percorso).isDirectory()) trovaRotte(percorso, acc)
    else if (voce === "route.ts") acc.push(percorso)
  }
  return acc
}

/** Da "app/api/admin/crm/contacts/route.ts" a "/api/admin/crm/contacts". */
function percorsoUrl(file) {
  return "/" + file.replace(/\/route\.ts$/, "").replace(/^app\//, "")
}

async function main() {
  // Importa la mappa vera, non una copia: se la mappa cambia, il controllo
  // cambia con lei.
  const mappa = await import("../lib/auth/api-area-map.ts").catch(() => null)
  if (!mappa) {
    console.error("Impossibile importare lib/auth/api-area-map.ts")
    process.exit(1)
  }
  const { isPublicApiPath, isSuperAdminApiPath, resolveApiArea } = mappa

  // CONTROLLO POSITIVO: casi di cui conosciamo gia' la risposta giusta. Se
  // sbaglia questi, e' rotto il misuratore, non il codice misurato — e senza
  // questa verifica un elenco tutto-rosso sembrerebbe una scoperta.
  const attesi = [
    ["app/api/admin/crm/contacts/route.ts", "/api/admin/crm/contacts", "crm"],
    ["app/api/admin/photos/route.ts", "/api/admin/photos", "photos"],
    ["app/api/cms/pages/route.ts", "/api/cms/pages", "cms"],
    ["app/api/chat/widget/route.ts", "/api/chat/widget", null], // pubblica
  ]
  for (const [f, urlAtteso, areaAttesa] of attesi) {
    const url = percorsoUrl(f)
    const area = resolveApiArea(url)
    if (url !== urlAtteso || area !== areaAttesa) {
      console.error(
        `CONTROLLO POSITIVO FALLITO: ${f} -> percorso "${url}" (atteso "${urlAtteso}"), ` +
          `area "${area}" (attesa "${areaAttesa}"). Il misuratore e' rotto: risultati non attendibili.`,
      )
      process.exit(1)
    }
  }

  const file = trovaRotte(RADICE_API).sort()
  const nonClassificate = []
  const nonOsservate = []
  const statoSbagliato = []

  for (const f of file) {
    const url = percorsoUrl(f)
    const contenuto = readFileSync(f, "utf8")

    const pubblica = isPublicApiPath(url)
    const superAdmin = isSuperAdminApiPath(url)
    const area = resolveApiArea(url)

    if (!pubblica && !superAdmin && !area) {
      nonClassificate.push(url)
      continue
    }

    // Punto cieco: usa un aiutante ma senza passargli la richiesta.
    const usaAiutante = /getAuthenticatedPropertyId|getCurrentProperty/.test(contenuto)
    const senzaRichiesta = /getAuthenticatedPropertyId\(\)|getCurrentProperty\(\)/.test(contenuto)
    if (area && usaAiutante && senzaRichiesta) {
      nonOsservate.push(url)
    }

    // In "enforce" il diniego diventa 403 solo se la rotta passa da
    // handleServiceError. Le altre lo trasformano nel loro 500 fisso: bloccano
    // comunque, ma dicono "server rotto" invece di "permesso negato".
    if (area && !senzaRichiesta && !/handleServiceError/.test(contenuto)) {
      statoSbagliato.push(url)
    }
  }

  console.log(`Rotte API totali: ${file.length}`)
  console.log("")

  console.log(`NON CLASSIFICATE (nessun controllo di area): ${nonClassificate.length}`)
  for (const r of nonClassificate) console.log(`  - ${r}`)
  console.log("")

  console.log(`NON OSSERVATE (chiamano l'aiutante senza la richiesta): ${nonOsservate.length}`)
  for (const r of nonOsservate) console.log(`  - ${r}`)
  console.log("")

  // Non fa fallire il controllo: bloccano comunque. E' un difetto di qualita'
  // del messaggio, da sanare prima di passare a "enforce".
  console.log(`STATO SBAGLIATO in enforce (500 invece di 403): ${statoSbagliato.length}`)
  console.log("  (bloccano correttamente, ma il messaggio dice 'server rotto')")
  for (const r of statoSbagliato.slice(0, 8)) console.log(`  - ${r}`)
  if (statoSbagliato.length > 8) console.log(`  ... e altre ${statoSbagliato.length - 8}`)
  console.log("")

  let fallito = false
  if (nonClassificate.length > MAX_NON_CLASSIFICATE) {
    console.error(`FALLITO: ${nonClassificate.length} rotte non classificate (soglia ${MAX_NON_CLASSIFICATE}).`)
    console.error("Aggiungile a API_AREA_MAP oppure a PUBLIC_API_PREFIXES in lib/auth/api-area-map.ts.")
    fallito = true
  }
  if (nonOsservate.length > MAX_NON_OSSERVATE) {
    console.error(`FALLITO: ${nonOsservate.length} rotte non osservate (soglia ${MAX_NON_OSSERVATE}).`)
    console.error("Passa `request` all'aiutante di autenticazione in quelle rotte.")
    fallito = true
  }

  if (fallito) process.exit(1)
  console.log("Copertura entro le soglie.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
