/**
 * Guardia: nessuna pagina deve restare senza footer.
 *
 * Nasce da un caso reale: /gallery rispondeva 200 senza footer NE'
 * intestazione (chi ci arrivava non aveva modo di navigare) e l'intera area
 * super-admin non ne aveva alcuno. Nessun controllo se ne accorgeva, perche'
 * cercare la parola "Footer" nel codice trova anche CardFooter, DialogFooter,
 * TableFooter: il progetto ne conta a decine e il rumore copriva i buchi.
 *
 * Per questo la guardia NON cerca la parola "Footer": verifica che ogni pagina
 * ottenga un footer dalla via prevista per la sua area, e ogni eccezione deve
 * essere dichiarata qui sotto con la sua motivazione.
 *
 * Soglia zero, scelta di proposito: una guardia che tollera "qualche" pagina
 * scoperta non serve a nulla, perche' il prossimo buco entra nella tolleranza.
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

const leggi = (p) => readFileSync(p, "utf8")
const elenca = (glob) =>
  execSync(`git ls-files '${glob}'`, { encoding: "utf8" }).trim().split("\n").filter(Boolean)

/**
 * Pagine che NON devono avere un footer, con la ragione.
 * Ogni voce e' una decisione, non una svista tollerata.
 */
const ECCEZIONI = new Map([
  [
    "app/(frontend)/chat-widget/page.tsx",
    "widget da incorporare in pagine di terzi: un footer qui comparirebbe dentro il riquadro della chat",
  ],
])

const problemi = []

// ---------------------------------------------------------------------------
// 1. Pagine pubbliche del sito hotel: ognuna monta il proprio <Footer />.
//    (il gruppo (frontend) non ha un layout che lo fornisca)
// ---------------------------------------------------------------------------
for (const p of elenca("app/(frontend)/**/page.tsx")) {
  if (ECCEZIONI.has(p)) continue
  const src = leggi(p)
  const monta = /<Footer\b/.test(src) || /<PlatformFooter\b/.test(src)
  if (!monta) problemi.push(`${p}: pagina pubblica senza footer`)
}

// ---------------------------------------------------------------------------
// 2. Area admin: la struttura monta ENTRAMBI i footer, che si escludono a
//    vicenda. Se ne sparisce uno, una parte delle pagine resta scoperta senza
//    che nulla lo segnali.
// ---------------------------------------------------------------------------
{
  const shell = leggi("components/platform/platform-shell.tsx")
  if (!/<PlatformFooter\s*\/>/.test(shell)) {
    problemi.push("platform-shell: manca <PlatformFooter /> (footer completo)")
  }
  if (!/<PlatformFooterBar\s*\/>/.test(shell)) {
    problemi.push("platform-shell: manca <PlatformFooterBar /> (barra pagine a tutta altezza)")
  }
  // Il footer completo deve stare DENTRO <main>: fuori sottrarrebbe altezza a
  // ogni pagina, perche' la struttura e' una colonna rigida di 100dvh.
  const dentroMain = /<main[^>]*>[\s\S]*<PlatformFooter\s*\/>[\s\S]*<\/main>/.test(shell)
  if (!dentroMain) {
    problemi.push("platform-shell: <PlatformFooter /> deve stare dentro <main> (altrimenti ruba altezza al contenuto)")
  }
}

// ---------------------------------------------------------------------------
// 3. Area super-admin: il footer arriva dal layout.
// ---------------------------------------------------------------------------
{
  const src = leggi("app/super-admin/layout.tsx")
  if (!/<CompanyFooter\s*\/>/.test(src)) {
    problemi.push("app/super-admin/layout.tsx: manca il footer (copre tutte le pagine super-admin)")
  }
}

// ---------------------------------------------------------------------------
// 4. Dentro l'area admin `min-h-screen` e' sempre un errore: quelle pagine
//    vivono dentro una colonna che vale gia' finestra meno intestazione meno
//    footer. Chiedere 100vh la fa sbordare e taglia il contenuto centrato.
// ---------------------------------------------------------------------------
{
  let trovate = 0
  for (const p of elenca("app/admin/**/*.tsx")) {
    const n = (leggi(p).match(/min-h-screen/g) || []).length
    if (n > 0) {
      trovate += n
      problemi.push(`${p}: ${n}x min-h-screen (usare min-h-full: la finestra e' gia' consumata da intestazione e footer)`)
    }
  }
  if (trovate === 0) console.log("  min-h-screen in app/admin : 0")
}

// ---------------------------------------------------------------------------

if (problemi.length > 0) {
  console.error("\nPagine o strutture senza footer:\n")
  for (const p of problemi) console.error(`  - ${p}`)
  console.error(`\n  totale: ${problemi.length}\n`)
  process.exit(1)
}

console.log(`  eccezioni dichiarate      : ${ECCEZIONI.size}`)
for (const [p, motivo] of ECCEZIONI) console.log(`      ${p}\n        ${motivo}`)
console.log("\n  Tutte le pagine hanno un footer.")
