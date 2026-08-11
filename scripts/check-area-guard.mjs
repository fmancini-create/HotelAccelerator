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
 *  3. GUARDIA MAI CHIAMATA — la rotta e' classificata, passa la richiesta e sa
 *     rispondere 403... ma non invoca `requireAreaApi`. Era il buco di QUESTO
 *     controllo: verificava tutta la PREPARAZIONE della guardia e mai la
 *     guardia. Misurato: 42 rotte gestivano il diniego, **zero** la
 *     chiamavano, e il controllo diceva "Copertura entro le soglie" con uscita
 *     0. E' lo stesso difetto di `checkBotCompanyAccess` in Manubot: il
 *     presidio esiste, e' verde, non lo chiama nessuno.
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
// Misurato: 4 (tutte su aree di base, quindi innocue). La soglia e' fissata al
// valore REALE, non a un numero comodo: una tolleranza piu' larga del difetto
// che deve sorvegliare lascia entrare peggioramenti senza dire niente.
const MAX_NON_OSSERVATE = 4
// Rotte ad area CONCEDIBILE che non invocano la guardia. La soglia e' ZERO di
// proposito, non fissata al valore misurato: qui il valore misurato era 42 su
// 42, cioe' il presidio non esisteva nei fatti. Registrare 42 come "normale"
// avrebbe reso permanente il difetto che questo controllo deve scoprire.
const MAX_GUARDIA_MAI_CHIAMATA = 0

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
  const { BASELINE_AREA_KEYS, GRANTABLE_AREA_KEYS } = await import("../lib/platform/areas.ts")

  // Aree su cui NON si pretende la chiamata alla guardia:
  //  - di base: concesse sempre, il diniego non puo' mai scattare;
  //  - solo-admin (users/modules/billing): non concedibili a un membro e gia'
  //    presidiate da `requireTenantAdmin`, che respinge i non amministratori.
  // Restano le aree davvero concedibili, le uniche dove la guardia decide.
  const GRANTABLE_ESCLUSE = new Set(
    [...BASELINE_AREA_KEYS, "users", "modules", "billing"].filter((k) => !GRANTABLE_AREA_KEYS.has(k)),
  )

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

  // CONTROLLO POSITIVO sul criterio del 403: una rotta che SO essere sanata
  // deve risultare sanata. Se il criterio smette di riconoscere l'aiutante
  // (per esempio perche' viene rinominato), lo zero diventerebbe falso e
  // sembrerebbe un successo.
  const sanataNota = "app/api/admin/crm/contacts/route.ts"
  if (!/\b(handleServiceError|isAreaDenied)\b/.test(readFileSync(sanataNota, "utf8"))) {
    console.error(
      `CONTROLLO POSITIVO FALLITO: ${sanataNota} dovrebbe gestire il 403 ma il criterio ` +
        `non lo riconosce. Il conteggio "STATO SBAGLIATO" non e' attendibile.`,
    )
    process.exit(1)
  }

  // CONTROLLO POSITIVO E NEGATIVO sul criterio "la guardia e' chiamata".
  // Senza il negativo, un'espressione che riconosce troppo (per esempio che
  // considera chiamata anche la sola importazione) darebbe ZERO e sembrerebbe
  // un successo. Il file della guardia CONTIENE il nome ma non e' una rotta
  // che la invoca: e' il campione perfetto per il caso negativo.
  const chiamaLaGuardia = (testo) => /\bawait\s+requireAreaApi\s*\(/.test(testo)
  if (!chiamaLaGuardia('  await requireAreaApi("crm", request)\n')) {
    console.error("CONTROLLO POSITIVO FALLITO: il criterio non riconosce una chiamata evidente.")
    process.exit(1)
  }
  if (chiamaLaGuardia('import { requireAreaApi } from "@/lib/auth/area-access"\n')) {
    console.error("CONTROLLO NEGATIVO FALLITO: il criterio scambia l'importazione per una chiamata.")
    process.exit(1)
  }

  const file = trovaRotte(RADICE_API).sort()
  const nonClassificate = []
  const nonOsservate = []
  const statoSbagliato = []
  const statoSbagliatoInnocuo = []
  const guardiaMaiChiamata = []

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
    //
    // Conta SOLO le aree concedibili: quelle di base non vengono mai negate,
    // quindi su di esse il difetto non puo' mai manifestarsi. Contarle insieme
    // gonfierebbe il numero da 47 a 83 e farebbe sembrare il problema il doppio
    // di quello che e'.
    // Due modi validi di rispondere 403: l'aiutante generale
    // (`handleServiceError`) oppure il riconoscimento diretto nel catch
    // (`isAreaDenied`). Cercarne uno solo rendeva il criterio STANTIO: dopo il
    // codemod il numero restava 47 anche se 42 rotte erano gia' sanate.
    // \b ai bordi: senza, `isAreaDeniedXX` verrebbe contato come sanato,
    // perche' CONTIENE `isAreaDenied`. Scoperto provando a "de-sanare" una
    // rotta: il conteggio non si muoveva.
    // La verifica che conta: la guardia viene davvero INVOCATA? Solo sulle
    // aree concedibili, le uniche dove il diniego puo' verificarsi.
    if (area && !GRANTABLE_ESCLUSE.has(area) && !chiamaLaGuardia(contenuto)) {
      guardiaMaiChiamata.push(`${url}  [${area}]`)
    }

    const gestisce403 = /\b(handleServiceError|isAreaDenied)\b/.test(contenuto)
    if (area && !senzaRichiesta && !gestisce403) {
      if (BASELINE_AREA_KEYS.includes(area)) {
        statoSbagliatoInnocuo.push(url)
      } else {
        statoSbagliato.push(url)
      }
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
  console.log("  Bloccano correttamente: e' un difetto del messaggio, non del blocco.")
  console.log(`  (altre ${statoSbagliatoInnocuo.length} su aree di base: mai negate, quindi innocue)`)
  for (const r of statoSbagliato.slice(0, 8)) console.log(`  - ${r}`)
  if (statoSbagliato.length > 8) console.log(`  ... e altre ${statoSbagliato.length - 8}`)
  console.log("")

  console.log(`GUARDIA MAI CHIAMATA (area concedibile, nessun requireAreaApi): ${guardiaMaiChiamata.length}`)
  for (const r of guardiaMaiChiamata) console.log(`  - ${r}`)
  console.log("")

  let fallito = false
  if (guardiaMaiChiamata.length > MAX_GUARDIA_MAI_CHIAMATA) {
    console.error(
      `FALLITO: ${guardiaMaiChiamata.length} rotte ad area concedibile non invocano requireAreaApi ` +
        `(soglia ${MAX_GUARDIA_MAI_CHIAMATA}).`,
    )
    console.error("Il presidio e' preparato ma non chiamato: non protegge nulla.")
    fallito = true
  }
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
