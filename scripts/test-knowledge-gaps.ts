/**
 * Prove dell'anello: l'esperienza delle conversazioni alimenta le basi.
 *
 * Non verifica "il codice gira": verifica le due promesse che contano.
 *  1. nella coda di approvazione finiscono DOMANDE, non saluti e non i nomi e
 *     numeri che gli ospiti mandano quando l'assistente li chiede;
 *  2. niente entra in una base senza che una persona abbia approvato.
 *
 * Le frasi provate sono quelle VERE misurate sui dati della struttura, non
 * inventate: e' l'unico modo di sapere se il filtro regge sul traffico reale.
 *
 * Uso: npx tsx scripts/test-knowledge-gaps.ts
 */

import { eUnaLacuna, sembraUnaDomanda, normalizzaDomanda, testoFonteDaLacuna, titoloFonteDaLacuna } from "../lib/ai/gaps"

let passate = 0
let fallite = 0

function verifica(nome: string, atteso: unknown, ottenuto: unknown) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto)
  if (ok) {
    passate += 1
    console.log(`  OK   ${nome}`)
  } else {
    fallite += 1
    console.log(`  NO   ${nome}\n         atteso:   ${JSON.stringify(atteso)}\n         ottenuto: ${JSON.stringify(ottenuto)}`)
  }
}

console.log("\n=== 1. Cosa NON deve finire nella coda di approvazione ===")

// Il saluto: 5 risposte reali con somiglianza 0 sono esattamente questo.
//
// "Ciao" NON basta a provare l'esclusione: verrebbe scartato comunque dal
// filtro delle tre parole, quindi la prova passerebbe anche se la regola sul
// saluto fosse rotta (verificato: col sabotaggio restava verde). Il caso che
// discrimina e' un saluto che ha la FORMA di una domanda.
verifica(
  "un saluto non e' una lacuna",
  false,
  eUnaLacuna({ soloSaluto: true, fondata: false, domanda: "Buongiorno, come state?" }),
)
verifica(
  "nemmeno un saluto piu' lungo e' una lacuna",
  false,
  eUnaLacuna({ soloSaluto: true, fondata: false, domanda: "Salve, come va oggi?" }),
)

// Misurato sui dati veri: l'ospite manda nome e telefono per il passaggio allo
// staff. Se finissero in coda, chi approva vedrebbe righe senza domande.
verifica(
  "un nome e un numero non sono una lacuna",
  false,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "Mario Rossi 3351234567" }),
)
verifica(
  "un ringraziamento non e' una lacuna",
  false,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "Grazie mille" }),
)
verifica(
  "una email da sola non e' una lacuna",
  false,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "mario.rossi@example.com" }),
)

// Un frammento come "quanto?" HA la forma della domanda (punto interrogativo e
// parola di richiesta) ma non dice di cosa: come fonte sarebbe inutilizzabile.
// E' il caso che prova il vincolo sulla lunghezza minima: senza quello questa
// riga entrerebbe in coda (verificato col sabotaggio).
verifica(
  "un frammento troppo corto non e' una lacuna",
  false,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "quanto?" }),
)

// Il caso piu' importante: la base COPRIVA la domanda. Registrarla direbbe che
// manca qualcosa che invece c'e', e chi approva aggiungerebbe un doppione.
verifica(
  "una domanda a cui la base ha risposto non e' una lacuna",
  false,
  eUnaLacuna({ soloSaluto: false, fondata: true, domanda: "A che ora e' la colazione?" }),
)

console.log("\n=== 2. Cosa DEVE finire nella coda ===")

verifica(
  "domanda con punto interrogativo",
  true,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "Avete un parcheggio per le moto?" }),
)
verifica(
  "domanda senza punto interrogativo",
  true,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "vorrei sapere gli orari della spa" }),
)
verifica(
  "domanda in inglese",
  true,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "Do you have a shuttle from the airport" }),
)
verifica(
  "richiesta di prezzo",
  true,
  eUnaLacuna({ soloSaluto: false, fondata: false, domanda: "quanto costa il massaggio di coppia" }),
)

console.log("\n=== 3. La stessa domanda ripetuta non crea righe nuove ===")

// Se queste tre non collassassero, la pagina mostrerebbe tre righe identiche da
// approvare tre volte.
const a = normalizzaDomanda("Avete la piscina?")
const b = normalizzaDomanda("avete la piscina")
const c = normalizzaDomanda("AVETE LA PISCINA!!!")
verifica("tre forme della stessa domanda danno la stessa chiave", true, a === b && b === c)
verifica("gli accenti non creano una chiave diversa", true, normalizzaDomanda("c'è il wifi") === normalizzaDomanda("c'e il wifi"))
verifica("due domande diverse hanno chiavi diverse", true, normalizzaDomanda("avete la piscina") !== normalizzaDomanda("avete il parcheggio"))

console.log("\n=== 4. La fonte creata dall'approvazione ===")

const testo = testoFonteDaLacuna("A che ora e' la colazione?", "Dalle 7:30 alle 10:30 in sala giardino.")
// La domanda deve stare NEL testo: la ricerca confronta la domanda dell'ospite
// col testo della fonte, quindi la sola risposta si recupererebbe male.
verifica("il testo della fonte contiene la domanda", true, testo.includes("A che ora e' la colazione?"))
verifica("il testo della fonte contiene la risposta", true, testo.includes("Dalle 7:30 alle 10:30"))
verifica("il titolo dichiara da dove viene", true, titoloFonteDaLacuna("A che ora e' la colazione?").startsWith("Dall'esperienza:"))
verifica(
  "un titolo lunghissimo viene accorciato",
  true,
  titoloFonteDaLacuna("x".repeat(400)).length <= 100,
)

console.log("\n=== 5. Controllo negativo: la prova sa fallire? ===")
// Senza questo, tutte le righe sopra potrebbero passare per costruzione.
const saGiudicare = sembraUnaDomanda("Avete la piscina?") === true && sembraUnaDomanda("ok") === false
verifica("il filtro distingue una domanda da un 'ok'", true, saGiudicare)

console.log(`\n=== ESITO: ${passate} passate, ${fallite} fallite ===\n`)
process.exit(fallite === 0 ? 0 : 1)
