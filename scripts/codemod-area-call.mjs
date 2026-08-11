/**
 * Codemod: INVOCA la guardia di area nelle rotte che la preparano soltanto.
 *
 * Il difetto che risolve: la mappa area, la guardia `requireAreaApi`, la
 * gestione del 403 nei catch (42 rotte) e il controllo di copertura erano
 * tutti presenti — ma **nessuna rotta chiamava la guardia**. Tutta la
 * preparazione, zero applicazione.
 *
 * DOVE INSERISCE, E PERCHE' PROPRIO LI'
 * La chiamata va DENTRO il `try`, non prima: `requireAreaApi` in "enforce"
 * lancia `AccessError(403)`, e solo il `catch` con `isAreaDenied` lo traduce
 * in un 403 vero. Inserita fuori dal `try`, l'eccezione risalirebbe a Next e
 * diventerebbe un **500**: bloccherebbe lo stesso, ma dicendo "server rotto"
 * invece di "permesso negato" — e nessuna misura saprebbe distinguerli.
 *
 * COSA SALTA, DICHIARANDOLO
 *  - gestori senza un parametro richiesta utilizzabile: senza richiesta la
 *    guardia non vede i cookie e valuterebbe sempre "no-identity" (che lascia
 *    passare): peggio di non metterla, perche' sembrerebbe presente;
 *  - gestori senza `try`: l'inserimento darebbe 500 invece di 403.
 * Entrambi vengono ELENCATI, non nascosti: restano lavoro dichiarato.
 *
 * Uso:
 *   node --experimental-strip-types scripts/codemod-area-call.mjs
 *   node --experimental-strip-types scripts/codemod-area-call.mjs --scrivi
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const SCRIVI = process.argv.includes("--scrivi")
const RADICE = "app/api"
const IMPORT_RIGA = 'import { requireAreaApi } from "@/lib/auth/area-access"'
const VERBI = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

function trovaRotte(dir, out = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce)
    if (statSync(p).isDirectory()) trovaRotte(p, out)
    else if (voce === "route.ts") out.push(p)
  }
  return out
}

function percorsoUrl(file) {
  return "/" + file.replace(/\/route\.ts$/, "").replace(/^app\//, "")
}

/**
 * Nome del primo parametro se e' utilizzabile come richiesta.
 * Scarta la destrutturazione (`{ params }`): non e' una richiesta.
 */
function nomeRichiesta(listaParametri) {
  const primo = listaParametri.split(",")[0]?.trim()
  if (!primo || primo.startsWith("{")) return null
  const nome = primo.split(":")[0].trim()
  if (!/^[A-Za-z_$][\w$]*$/.test(nome)) return null
  // `_request` indica un parametro dichiaratamente inutilizzato: usarlo
  // funzionerebbe, ma il nome mentirebbe. Si rinomina a parte, non qui.
  if (nome.startsWith("_")) return null
  return nome
}

async function main() {
  const { resolveApiArea } = await import("../lib/auth/api-area-map.ts")
  const { BASELINE_AREA_KEYS, GRANTABLE_AREA_KEYS } = await import("../lib/platform/areas.ts")

  const escluse = new Set(
    [...BASELINE_AREA_KEYS, "users", "modules", "billing"].filter((k) => !GRANTABLE_AREA_KEYS.has(k)),
  )

  const modificati = []
  const saltatiSenzaRichiesta = []
  const saltatiSenzaTry = []
  let inserimentiTotali = 0

  for (const file of trovaRotte(RADICE).sort()) {
    const url = percorsoUrl(file)
    const area = resolveApiArea(url)
    if (!area || escluse.has(area)) continue

    let testo = readFileSync(file, "utf8")
    if (/\bawait\s+requireAreaApi\s*\(/.test(testo)) continue // gia' presidiata

    const righe = testo.split("\n")
    const daInserire = []

    for (let i = 0; i < righe.length; i++) {
      const m = righe[i].match(
        new RegExp(`^export\\s+async\\s+function\\s+(${VERBI.join("|")})\\s*\\(([^)]*)\\)`),
      )
      if (!m) continue
      const [, verbo, parametri] = m

      const richiesta = nomeRichiesta(parametri)
      if (!richiesta) {
        saltatiSenzaRichiesta.push(`${url} ${verbo}`)
        continue
      }

      // Primo `try {` che appartiene a questo gestore: si ferma al gestore
      // successivo per non rubare il `try` di quello dopo.
      let indiceTry = -1
      for (let j = i + 1; j < righe.length; j++) {
        if (/^export\s+(async\s+)?function\s/.test(righe[j])) break
        if (/^\s*try\s*\{\s*$/.test(righe[j])) {
          indiceTry = j
          break
        }
      }
      if (indiceTry === -1) {
        saltatiSenzaTry.push(`${url} ${verbo}`)
        continue
      }

      const indent = (righe[indiceTry].match(/^(\s*)/) || ["", ""])[1]
      daInserire.push({ riga: indiceTry, indent, richiesta, verbo })
    }

    if (daInserire.length === 0) continue

    // Dal fondo verso l'alto: gli indici delle righe precedenti restano validi.
    for (const { riga, indent, richiesta } of daInserire.reverse()) {
      righe.splice(
        riga + 1,
        0,
        `${indent}  // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.`,
        `${indent}  await requireAreaApi("${area}", ${richiesta})`,
      )
    }
    testo = righe.join("\n")

    if (!testo.includes(IMPORT_RIGA)) {
      const r2 = testo.split("\n")
      let ultimo = -1
      for (let i = 0; i < r2.length; i++) if (/^import\s/.test(r2[i])) ultimo = i
      if (ultimo === -1) {
        console.error(`  SALTATO (nessun import): ${url}`)
        continue
      }
      r2.splice(ultimo + 1, 0, IMPORT_RIGA)
      testo = r2.join("\n")
    }

    modificati.push({ url, area, inserimenti: daInserire.length })
    inserimentiTotali += daInserire.length
    if (SCRIVI) writeFileSync(file, testo, "utf8")
  }

  console.log(SCRIVI ? "=== APPLICATO ===" : "=== A VUOTO (nessun file scritto) ===")
  console.log(`File da modificare : ${modificati.length}`)
  console.log(`Chiamate inserite  : ${inserimentiTotali}`)
  console.log("")
  for (const m of modificati) console.log(`  ${m.url}  [${m.area}]  (${m.inserimenti})`)

  if (saltatiSenzaRichiesta.length) {
    console.log("")
    console.log(`SALTATI - nessun parametro richiesta utilizzabile: ${saltatiSenzaRichiesta.length}`)
    for (const s of saltatiSenzaRichiesta) console.log(`  - ${s}`)
  }
  if (saltatiSenzaTry.length) {
    console.log("")
    console.log(`SALTATI - nessun try (darebbero 500 invece di 403): ${saltatiSenzaTry.length}`)
    for (const s of saltatiSenzaTry) console.log(`  - ${s}`)
  }
}

main()
