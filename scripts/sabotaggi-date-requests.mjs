/**
 * Sabotaggi sulla logica della pipeline.
 *
 * Ogni sabotaggio introduce a mano un difetto che un lettore distratto potrebbe
 * scrivere davvero, e la suite DEVE diventare rossa. Se resta verde, la prova
 * non protegge quella riga.
 *
 * La GUARDIA DI APPLICAZIONE esiste perché l'errore più insidioso è mio: se la
 * riga da sostituire non esiste più (l'ho riscritta, o l'ho ricordata male), la
 * sostituzione non avviene, la suite resta verde e io leggerei "sabotaggio non
 * colto" quando in realtà non è mai stato applicato. Qui un sabotaggio non
 * applicato esce con codice 1 e interrompe tutto.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { createHash } from "node:crypto"

const FILE = "lib/crm/date-requests.ts"
const originale = readFileSync(FILE, "utf8")
const improntaIniziale = createHash("sha256").update(originale).digest("hex")

const sabotaggi = [
  // ── classificazione ──
  ["dominio interno ignorato", 'if (dominio && email.endsWith(`@${dominio}`)) return "interna"', 'if (false) return "interna"'],
  ["prove non riconosciute", 'if (/zz\\s*prova/i.test(subject)) return "prova"', 'if (false) return "prova"'],
  ["conferma da oggetto spenta", 'if (confermaDaOggetto(subject)) return "conferma_gestionale"', 'if (false) return "conferma_gestionale"'],
  ["dominio non normalizzato", '.replace(/^www\\./, "")', ""],
  ["confronto dominio senza @", "email.endsWith(`@${dominio}`)", "email.endsWith(dominio)"],
  // ── fasi: il cuore della decisione presa oggi ──
  ["fase dedotta di nuovo dall'esito", 'if (scelta && FASI.some((f) => f.key === scelta)) return scelta as FaseKey', 'if (riga.stage === "__mai__") return "aperta"'],
  ["fase inventata accettata", "FASI.some((f) => f.key === scelta)", "true"],
  ["tariffa non promuove più", "if (riga.quoted_rate_cents !== null && riga.quoted_rate_cents > 0) return \"preventivo_inviato\"", ""],
  ["tariffa zero promuove", "riga.quoted_rate_cents > 0", "riga.quoted_rate_cents >= 0"],
  ["nota IA inventata sul nulla", 'if (!e) return null', 'if (!e) return "l\'IA ha letto: aperta"'],
  // ── traduzione ──
  // Le due righe seguenti sono state COPIATE dal file, non ricordate: il
  // tentativo precedente citava un `metodo.startsWith("regole:") ? ... : ...`
  // che non è mai esistito, e la guardia l'ha fermato.
  ["scidoo scambiato con persona", 'if (m.startsWith("regole:scidoo")) return "scidoo"', ""],
  ["myrestoo scambiato con persona", 'if (m.startsWith("regole:myrestoo")) return "myrestoo"', ""],
  ["riferimento non più stabile", "return `conv:${e.conversation_id}|${arrivo ?? \"senza-arrivo\"}|${partenza ?? \"senza-partenza\"}`", "return `estrazione:${e.id}`"],
]

let applicati = 0
let colti = 0

console.log(`  ${sabotaggi.length} sabotaggi dichiarati\n`)

for (const [nome, cerca, sostituisci] of sabotaggi) {
  if (!originale.includes(cerca)) {
    console.log(`  NON APPLICATO: "${nome}" — la riga cercata non esiste nel file.`)
    console.log(`    cercavo: ${cerca.slice(0, 90)}`)
    writeFileSync(FILE, originale)
    process.exit(1)
  }
  const rotto = originale.replace(cerca, sostituisci)
  if (rotto === originale) {
    console.log(`  NON APPLICATO: "${nome}" — sostituzione senza effetto.`)
    writeFileSync(FILE, originale)
    process.exit(1)
  }
  applicati += 1
  writeFileSync(FILE, rotto)

  let rosso = false
  try {
    execSync("npx vitest run lib/crm/__tests__/date-requests.test.ts", { stdio: "pipe", timeout: 180000 })
  } catch {
    rosso = true
  }
  if (rosso) colti += 1
  console.log(`  ${rosso ? "colto  " : "SFUGGITO"}  ${nome}`)
  writeFileSync(FILE, originale)
}

const improntaFinale = createHash("sha256").update(readFileSync(FILE, "utf8")).digest("hex")
console.log(`\n  dichiarati=${sabotaggi.length}  applicati=${applicati}  colti=${colti}`)
console.log(`  file ripristinato identico: ${improntaIniziale === improntaFinale ? "SI" : "NO — ATTENZIONE"}`)
process.exit(colti === sabotaggi.length && improntaIniziale === improntaFinale ? 0 : 1)
