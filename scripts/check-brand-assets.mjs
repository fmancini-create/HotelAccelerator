/**
 * GUARDIA DEL MARCHIO.
 *
 * Il controllo precedente contava le sostituzioni RIUSCITE (11 su 11) e per
 * questo dava verde pur avendo saltato del tutto il footer: misurava il
 * proprio lavoro, non il risultato. Questa guardia fa il contrario, cerca
 * cio' che RESTA da sistemare in tutto il repo. La soglia e' zero.
 *
 *   node scripts/check-brand-assets.mjs
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * sharp serve solo alla misura dell'alone e NON e' una dipendenza del
 * progetto (pesa parecchio per un controllo). Se manca, i controlli sui
 * pixel non vengono eseguiti — ma la guardia lo DICE e li conta.
 *
 * Saltare in silenzio sarebbe il difetto peggiore di tutti: un verde che non
 * significa nulla. E' lo stesso errore che aveva lasciato passare il footer.
 */
let sharp = null
try {
  ;({ default: sharp } = await import("sharp"))
} catch {
  /* assente: sotto viene segnalato */
}
let nonEseguiti = 0

// I siti dei clienti (santaddeo, barronci) hanno un marchio proprio: il razzo
// di HotelAccelerator li' NON ci va, quindi restano fuori dal perimetro.
const ESCLUSI =
  /(^|\/)(node_modules|\.next|\.git|\.v0|user_read_only_context)\/|apps\/santaddeo|components\/barronci|\/tenant\//

/**
 * Alone MISURATO su ciascuna variante dopo la pulizia (percentuale di
 * contorno quasi-bianco). Per confronto, i valori sul file sporco erano:
 * mark 13/25/41/46/-/72/77, lockup 25/-/61/-. Se un numero qui sotto
 * risalisse, la pulizia si e' rotta.
 */
const RIFERIMENTO = {
  "logo-ha-mark-32.png": 4,
  "logo-ha-mark-64.png": 8,
  "logo-ha-mark-96.png": 13,
  "logo-ha-mark-128.png": 21,
  "logo-ha-mark-192.png": 35,
  "logo-ha-mark-256.png": 40,
  "logo-ha-mark-512.png": 34,
  "logo-ha-lockup-96.png": 12,
  "logo-ha-lockup-192.png": 28,
  "logo-ha-lockup-288.png": 29,
  "logo-ha-lockup-576.png": 33,
}

const file = execSync("git ls-files '*.tsx' '*.ts'", { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !ESCLUSI.test(f))

const problemi = []

for (const f of file) {
  const righe = readFileSync(`${ROOT}/${f}`, "utf8").split("\n")

  righe.forEach((riga, i) => {
    const n = i + 1
    const intorno = righe.slice(Math.max(0, i - 3), i + 4).join("\n")

    // 1. Segnaposto testuale "HA" dentro un riquadro colorato.
    if (/>\s*HA\s*</.test(riga)) {
      problemi.push([f, n, 'segnaposto ">HA<"', riga.trim()])
    }

    // 2. Icona generica di libreria usata come marchio: si riconosce perche'
    //    a pochissime righe di distanza compare il nome del prodotto.
    const icona = riga.match(/<(Building2|Rocket|Hotel|Zap|Sparkles)\b/)
    if (icona && /HotelAccelerator/.test(intorno)) {
      problemi.push([f, n, `icona generica <${icona[1]}> come marchio`, riga.trim()])
    }
  })
}

// 3. La favicon a file NON deve tornare in app/: varrebbe per ogni rotta e
//    metterebbe il razzo nella scheda del browser dei siti dei clienti.
for (const nome of ["app/icon.png", "app/apple-icon.png", "app/favicon.ico"]) {
  try {
    readFileSync(`${ROOT}/${nome}`)
    problemi.push([nome, 0, "favicon globale: contamina i siti dei clienti", ""])
  } catch {
    /* assente = corretto */
  }
}

// 4. Ogni file citato dal manifest deve esistere davvero.
const manifest = JSON.parse(readFileSync(`${ROOT}/public/manifest.json`, "utf8"))
for (const i of manifest.icons || []) {
  try {
    readFileSync(`${ROOT}/public${i.src}`)
  } catch {
    problemi.push(["public/manifest.json", 0, `icona dichiarata ma assente: ${i.src}`, ""])
  }
}

// 5. Le varianti SERVITE dal browser devono essere pulite e devono esistere.
//    Questo controllo nasce da un errore reale: avevo ripulito i file
//    logo-hotelaccelerator-*, che il codice non usa piu', mentre il
//    componente serviva i logo-ha-*, rimasti sporchi.
{
  const sorgente = readFileSync(`${ROOT}/components/brand/hotel-accelerator-logo.tsx`, "utf8")
  const misure = (s) => {
    const m = sorgente.match(new RegExp(`${s} = \\[([^\\]]+)\\]`))
    return m
      ? m[1]
          .split(",")
          .map((n) => parseInt(n.trim(), 10))
          .filter(Boolean)
      : []
  }
  const attesi = [
    ...misure("MARK_SIZES").map((s) => `logo-ha-mark-${s}.png`),
    ...misure("LOCKUP_HEIGHTS").map((h) => `logo-ha-lockup-${h}.png`),
  ]
  if (attesi.length === 0) {
    problemi.push([
      "components/brand/hotel-accelerator-logo.tsx",
      0,
      "misure non leggibili: il controllo non puo' funzionare",
      "",
    ])
  }
  for (const nome of attesi) {
    let buf
    try {
      buf = readFileSync(`${ROOT}/public/${nome}`)
    } catch {
      problemi.push([`public/${nome}`, 0, "variante dichiarata in srcSet ma ASSENTE", ""])
      continue
    }
    if (!sharp) {
      nonEseguiti++
      continue
    }
    // MISURA SPECIFICA dell'alone: un pixel chiaro conta solo se tocca il
    // VUOTO, cioe' se sta sul contorno esterno. I tagli bianchi interni
    // (ogiva, pinne) fanno parte del disegno e devono restare: la prima
    // versione di questo controllo li sommava all'alone e dava un 21%
    // ingannevole su un file in realta' pulito.
    //
    // Il valore si normalizza sulla lunghezza del contorno, cosi' la soglia
    // non dipende dalla misura del file.
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const W = info.width
    const H = info.height
    const alfa = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3])
    let contorno = 0
    let sporchi = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        if (data[i + 3] < 8) continue
        const suBordo = alfa(x - 1, y) < 8 || alfa(x + 1, y) < 8 || alfa(x, y - 1) < 8 || alfa(x, y + 1) < 8
        if (!suBordo) continue
        contorno++
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) sporchi++
      }
    }
    // La soglia NON e' un numero scelto a occhio. Il residuo cresce con la
    // misura del file, perche' su una tela grande la sfumatura del bordo
    // occupa piu' pixel: un limite fisso boccerebbe i file grandi puliti e
    // lascerebbe passare i piccoli sporchi. Il riferimento e' quindi il
    // valore MISURATO sul file gia' pulito, con un margine del 25%.
    const perc = contorno ? (100 * sporchi) / contorno : 0
    const limite = RIFERIMENTO[nome]
    if (limite === undefined) {
      problemi.push([`public/${nome}`, 0, "variante senza riferimento: aggiornare RIFERIMENTO", ""])
    } else if (perc > limite * 1.25 + 1) {
      problemi.push([`public/${nome}`, 0, `alone bianco sul contorno: ${perc.toFixed(0)}% (riferimento ${limite}%)`, ""])
    }
  }
}

console.log(`  file esaminati: ${file.length}`)
if (nonEseguiti) {
  console.log(`  ATTENZIONE: ${nonEseguiti} controlli sull'alone NON eseguiti (manca sharp).`)
  console.log("             installalo con:  npm i -D sharp")
}
if (problemi.length === 0) {
  console.log(
    nonEseguiti
      ? "  Nessun residuo tra i controlli ESEGUITI (vedi avviso sopra)."
      : "  OK — nessun residuo del vecchio marchio.",
  )
  process.exit(0)
}
console.log(`  RESIDUI: ${problemi.length}`)
for (const [f, n, che, riga] of problemi) {
  console.log(`    ${f}${n ? ":" + n : ""}  ${che}`)
  if (riga) console.log(`        ${riga.slice(0, 100)}`)
}
process.exit(1)
