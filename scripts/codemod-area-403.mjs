/**
 * Codemod: fa rispondere 403 (invece del 500 generico) al diniego della
 * guardia di area.
 *
 * PERCHE' UN CODEMOD E NON 47 MODIFICHE A MANO: la modifica e' identica in ogni
 * file (una riga in cima al `catch`), e un codemod si puo' eseguire A VUOTO per
 * vedere l'effetto prima di applicarlo. A mano, 47 file significano 47
 * occasioni di sbagliare in silenzio.
 *
 * Uso:
 *   node scripts/codemod-area-403.mjs          -> a vuoto (non scrive nulla)
 *   node scripts/codemod-area-403.mjs --scrivi -> applica
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const SCRIVI = process.argv.includes("--scrivi")
const RADICE = "app/api"
const IMPORT_RIGA = 'import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"'

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
 * Trova il corpo di un blocco catch contando le parentesi graffe.
 * Serve per NON inserire un `return` dentro un catch che non risponde con una
 * NextResponse (per esempio un catch dentro una funzione di supporto).
 */
function corpoDelCatch(testo, indiceApertura) {
  let livello = 0
  for (let i = indiceApertura; i < testo.length; i++) {
    if (testo[i] === "{") livello++
    else if (testo[i] === "}") {
      livello--
      if (livello === 0) return testo.slice(indiceApertura, i + 1)
    }
  }
  return ""
}

async function main() {
  const { resolveApiArea } = await import("../lib/auth/api-area-map.ts")
  const { BASELINE_AREA_KEYS } = await import("../lib/platform/areas.ts")

  const modificati = []
  const saltatiSenzaBinding = []
  let inserimentiTotali = 0

  for (const file of trovaRotte(RADICE).sort()) {
    const url = percorsoUrl(file)
    const area = resolveApiArea(url)

    // Solo le rotte dove il diniego puo' davvero verificarsi:
    // area concedibile (quelle di base non vengono mai negate), guardia
    // attraversata (la richiesta viene passata), e nessun aiutante che gia'
    // mappa il 403.
    if (!area) continue
    if (BASELINE_AREA_KEYS.includes(area)) continue

    let testo = readFileSync(file, "utf8")
    if (/getAuthenticatedPropertyId\(\)|getCurrentProperty\(\)/.test(testo)) continue
    if (/handleServiceError/.test(testo)) continue
    if (testo.includes("isAreaDenied")) continue

    // Individua i catch CON variabile legata e che rispondono con NextResponse.
    const righe = testo.split("\n")
    const daInserire = []
    for (let i = 0; i < righe.length; i++) {
      // L'annotazione di tipo e' OPZIONALE: `catch (error: any)` e' la forma
      // piu' diffusa qui (42 casi). Senza `(?::\s*[^)]+)?` il riconoscitore ne
      // saltava 20 dichiarandole "senza variabile legata" — un numero
      // implausibile che ha smascherato il difetto.
      const m = righe[i].match(/^(\s*)\}\s*catch\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::\s*[^)]+)?\)\s*\{\s*$/)
      if (!m) {
        if (/^\s*\}\s*catch\s*\{\s*$/.test(righe[i])) saltatiSenzaBinding.push(`${url}:${i + 1}`)
        continue
      }
      const [, indent, nomeVar] = m
      const posizione = testo.indexOf(righe[i])
      const corpo = corpoDelCatch(testo, testo.indexOf("{", posizione))
      if (!/return\s+NextResponse\.json/.test(corpo)) continue
      daInserire.push({ riga: i, indent, nomeVar })
    }

    if (daInserire.length === 0) continue

    // Inserisce dal fondo verso l'alto, cosi' gli indici restano validi.
    for (const { riga, indent, nomeVar } of daInserire.reverse()) {
      righe.splice(
        riga + 1,
        0,
        `${indent}  // Diniego della guardia di area: 403, non il 500 generico qui sotto.`,
        `${indent}  if (isAreaDenied(${nomeVar})) return areaDeniedResponse(${nomeVar})`,
      )
    }
    testo = righe.join("\n")

    // Import subito dopo l'ultimo import esistente.
    if (!testo.includes(IMPORT_RIGA)) {
      const righe2 = testo.split("\n")
      let ultimo = -1
      for (let i = 0; i < righe2.length; i++) {
        if (/^import\s/.test(righe2[i])) ultimo = i
      }
      if (ultimo === -1) {
        console.error(`  SALTATO (nessun import trovato): ${url}`)
        continue
      }
      righe2.splice(ultimo + 1, 0, IMPORT_RIGA)
      testo = righe2.join("\n")
    }

    modificati.push({ url, inserimenti: daInserire.length })
    inserimentiTotali += daInserire.length
    if (SCRIVI) writeFileSync(file, testo, "utf8")
  }

  console.log(SCRIVI ? "=== APPLICATO ===" : "=== A VUOTO (nessun file scritto) ===")
  console.log(`File da modificare : ${modificati.length}`)
  console.log(`Inserimenti totali : ${inserimentiTotali}`)
  console.log("")
  for (const m of modificati) console.log(`  ${m.url}  (${m.inserimenti})`)

  if (saltatiSenzaBinding.length) {
    console.log("")
    console.log(`Catch SENZA variabile legata (impossibile riconoscere l'errore): ${saltatiSenzaBinding.length}`)
    for (const s of saltatiSenzaBinding.slice(0, 10)) console.log(`  - ${s}`)
  }
}

main()
