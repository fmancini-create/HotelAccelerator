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
 * La funzione VERA, importata dal file che usa anche la pagina.
 *
 * Prima qui c'era una copia, tenuta d'accordo da un confronto di testo: un
 * meccanismo fragile, perche' bastava riformattare la pagina per far fallire il
 * confronto su codice corretto. Ora la funzione sta in `lib/telephony/display.ts`
 * (nessun JSX, importabile da uno script) e la copia non esiste piu': non c'e'
 * modo che queste prove restino verdi su codice diverso da quello che gira.
 */
import { numeroLeggibile, etichettaEsito } from "../lib/telephony/display"

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

/**
 * L'etichetta dell'esito.
 *
 * Un timeout del gruppo e' diverso da una persa dichiarata dal provider, ma non
 * deve sembrare un guasto del PBX: "Caduta al centralino" era fuorviante.
 */
console.log("\nEtichetta dell'esito\n")
const casiEsito: Array<{ nome: string; status: string; fonte: string; atteso: string }> = [
  { nome: "timeout del gruppo di squillo (dedotto)", status: "missed", fonte: "ring_group_timeout", atteso: "Non risposta dal gruppo" },
  { nome: "persa dichiarata dal centralino", status: "missed", fonte: "provider", atteso: "Senza risposta" },
  // Controllo negativo: una chiamata riuscita non diventa persa nemmeno se la
  // fonte fosse per errore quella della deduzione.
  { nome: "completata: resta completata", status: "completed", fonte: "provider", atteso: "Completata" },
  { nome: "completata con fonte dedotta: resta completata", status: "completed", fonte: "ring_group_timeout", atteso: "Completata" },
]
for (const c of casiEsito) {
  const reso = etichettaEsito(c.status, c.fonte)
  if (reso === c.atteso) {
    ok++
    console.log(`  ok   ${c.nome} -> "${reso}"`)
  } else {
    ko++
    console.log(`  ROTTO ${c.nome} -> "${reso}", atteso "${c.atteso}"`)
  }
}

/**
 * La pagina deve USARE le funzioni condivise, non una propria copia.
 *
 * Senza questo controllo qualcuno potrebbe reintrodurre una funzione locale in
 * pagina: queste prove resterebbero verdi mentre a schermo gira altro codice.
 */
import { readFileSync } from "node:fs"
const sorgentePagina = readFileSync(new URL("../app/admin/calls/page.tsx", import.meta.url), "utf8")
if (
  sorgentePagina.includes('from "@/lib/telephony/display"') &&
  !/function numeroLeggibile/.test(sorgentePagina) &&
  !/function etichettaEsito/.test(sorgentePagina)
) {
  ok++
  console.log("\n  ok   la pagina importa le funzioni condivise e non ne tiene una copia")
} else {
  ko++
  console.log("\n  ROTTO la pagina non usa le funzioni condivise: queste prove NON provano il codice vero")
}

console.log(`\nRisultato: ${ok} superate, ${ko} fallite`)
if (ko > 0) process.exit(1)
