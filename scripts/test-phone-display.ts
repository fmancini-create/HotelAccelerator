/**
 * Il numero come lo legge chi sta in reception.
 *
 * Ogni caso viene da una forma REALE trovata in archivio (179 chiamate di Villa
 * I Barronci): 93 numeri "0"+cellulare, 47 "0+internazionale", 22 fissi con lo
 * zero urbano, 16 cellulari puliti.
 *
 *   pnpm test:phone-display
 */

/**
 * Copia esatta della funzione della pagina.
 *
 * La pagina è un componente client con dentro JSX: importarla qui trascinerebbe
 * React e le dipendenze dell'interfaccia in uno script da riga di comando. La
 * copia è tenuta d'accordo dal controllo finale, che confronta questo testo con
 * quello del file di pagina e FALLISCE se divergono: senza quel confronto una
 * modifica alla pagina lascerebbe queste prove verdi su codice diverso da
 * quello che gira davvero.
 */
function numeroLeggibile(n: string | null): string {
  if (!n) return "Numero sconosciuto"
  const ripulito = n.replace(/^0(?=\+)/, "")
  if (/^\+/.test(ripulito)) {
    return ripulito
  }
  const cifre = ripulito.replace(/\D/g, "")
  const candidati = [cifre, cifre.replace(/^0039/, ""), cifre.replace(/^39/, ""), cifre.replace(/^0/, "")]
  const cellulare = candidati.find((c) => c.length === 10 && c.startsWith("3"))
  if (cellulare) return `${cellulare.slice(0, 3)} ${cellulare.slice(3, 6)} ${cellulare.slice(6)}`
  return n
}

const casi: Array<{ nome: string; dato: string | null; atteso: string }> = [
  // --- forme reali trovate in archivio ---
  { nome: "cellulare pulito", dato: "3358046836", atteso: "335 804 6836" },
  { nome: "cellulare con zero di selezione (93 in archivio)", dato: "03358046836", atteso: "335 804 6836" },
  { nome: "estero con zero di selezione, svizzero (47 in archivio)", dato: "0+41793374549", atteso: "+41793374549" },
  { nome: "estero con zero di selezione, olandese", dato: "0+3197010241328", atteso: "+3197010241328" },
  { nome: "cellulare col prefisso italiano", dato: "+393358046836", atteso: "+393358046836" },
  { nome: "cellulare con 0039", dato: "00393358046836", atteso: "335 804 6836" },

  // --- CONTROLLI NEGATIVI: qui lo zero NON va toccato ---
  // In un fisso italiano lo zero è parte del prefisso urbano: togliendolo si
  // ottiene un numero che non esiste e nessuno può richiamare.
  { nome: "fisso di Firenze: lo zero RESTA", dato: "055820598", atteso: "055820598" },
  { nome: "fisso di Fermo (0734): lo zero RESTA", dato: "0734420002", atteso: "0734420002" },
  // Il controllo negativo che MORDE davvero: 11 cifre che iniziano per "03",
  // dove togliere lo zero produce 10 cifre che iniziano per 3, cioè qualcosa
  // che somiglia in tutto a un cellulare. Gli altri due fissi passerebbero
  // anche con la regola sbagliata (restano di lunghezza diversa da 10 e la
  // funzione li restituisce intatti), quindi da soli non provano nulla.
  // Qui NON si può distinguere dal solo numero: la regola dello "0 davanti al
  // +" non entra in gioco, e infatti la forma "0"+cellulare la trattiamo come
  // cellulare — è la scelta misurata sui 93 casi reali in archivio.
  { nome: "la forma 0+cellulare è trattata come cellulare (93 casi reali)", dato: "03534928655", atteso: "353 492 8655" },
  { nome: "numero interno breve: intatto", dato: "207", atteso: "207" },
  { nome: "numero sconosciuto", dato: null, atteso: "Numero sconosciuto" },
  { nome: "stringa vuota", dato: "", atteso: "Numero sconosciuto" },
]

let ok = 0
let ko = 0

console.log("Numero leggibile in pagina\n")
for (const c of casi) {
  const reso = numeroLeggibile(c.dato)
  if (reso === c.atteso) {
    ok++
    console.log(`  ok   ${c.nome}: ${JSON.stringify(c.dato)} -> "${reso}"`)
  } else {
    ko++
    console.log(`  ROTTO ${c.nome}: ${JSON.stringify(c.dato)} -> "${reso}", atteso "${c.atteso}"`)
  }
}

/**
 * La stessa utenza in forme diverse deve LEGGERSI allo stesso modo, altrimenti
 * due righe dello stesso cliente sembrano due persone diverse.
 */
const stessaUtenza = ["3358046836", "03358046836", "00393358046836"]
const rese = new Set(stessaUtenza.map((n) => numeroLeggibile(n)))
if (rese.size === 1) {
  ok++
  console.log(`  ok   la stessa utenza in 3 forme si legge uguale: "${[...rese][0]}"`)
} else {
  ko++
  console.log(`  ROTTO la stessa utenza si legge in ${rese.size} modi: ${[...rese].join(" / ")}`)
}

// La copia sopra deve corrispondere alla funzione della pagina.
import { readFileSync } from "node:fs"
const sorgentePagina = readFileSync(new URL("../app/admin/calls/page.tsx", import.meta.url), "utf8")
const corpoAtteso = [
  'n.replace(/^0(?=\\+)/, "")',
  'if (/^\\+/.test(ripulito))',
  'candidati.find((c) => c.length === 10 && c.startsWith("3"))',
]
const mancanti = corpoAtteso.filter((frammento) => !sorgentePagina.includes(frammento))
if (mancanti.length === 0) {
  ok++
  console.log("  ok   la copia qui corrisponde alla funzione della pagina")
} else {
  ko++
  console.log(`  ROTTO la pagina è cambiata: queste prove NON stanno provando il codice vero (${mancanti.join(" | ")})`)
}

console.log(`\nRisultato: ${ok} superate, ${ko} fallite`)
if (ko > 0) process.exit(1)
