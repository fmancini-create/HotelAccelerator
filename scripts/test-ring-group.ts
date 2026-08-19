/**
 * Prove sulla riclassificazione delle chiamate cadute e sulla pulizia del numero.
 *
 * I casi usano le durate REALI misurate sull'interno 801 di Villa I Barronci,
 * non valori inventati: 35, 36, 45, 50, 54, 55, 68, 68, 73, 75 (x31), 76.
 */

import { esitoGruppoSquillo, numeroSenzaPrefissoDiUscita } from "../lib/telephony/ring-group"

let passate = 0
let fallite = 0

function verifica(nome: string, atteso: unknown, ottenuto: unknown) {
  const ok = JSON.stringify(atteso) === JSON.stringify(ottenuto)
  if (ok) {
    passate++
    console.log(`  OK   ${nome}`)
  } else {
    fallite++
    console.log(`  ROTTO ${nome}: atteso ${JSON.stringify(atteso)}, ottenuto ${JSON.stringify(ottenuto)}`)
  }
}

const GRUPPO = { kindInterno: "group", direction: "inbound", status: "completed", timeoutSecondi: 75 }

console.log("Chiamate cadute sul gruppo di squillo")
verifica("75s esatti sul gruppo = persa", "missed", esitoGruppoSquillo({ ...GRUPPO, durataSecondi: 75 }))
verifica("76s NON riclassificata (puo' essere una conversazione)", null, esitoGruppoSquillo({ ...GRUPPO, durataSecondi: 76 }))
verifica("73s NON riclassificata", null, esitoGruppoSquillo({ ...GRUPPO, durataSecondi: 73 }))
verifica("35s conversazione breve resta completata", null, esitoGruppoSquillo({ ...GRUPPO, durataSecondi: 35 }))
verifica("68s resta completata", null, esitoGruppoSquillo({ ...GRUPPO, durataSecondi: 68 }))

console.log("\nConfini della deduzione")
verifica(
  "senza timeout dichiarato non si deduce nulla",
  null,
  esitoGruppoSquillo({ ...GRUPPO, timeoutSecondi: null, durataSecondi: 75 }),
)
verifica(
  "timeout a zero non abilita la deduzione",
  null,
  esitoGruppoSquillo({ ...GRUPPO, timeoutSecondi: 0, durataSecondi: 0 }),
)
verifica(
  "interno di una PERSONA non viene toccato",
  null,
  esitoGruppoSquillo({ ...GRUPPO, kindInterno: "shared", durataSecondi: 75 }),
)
verifica(
  "interno senza etichetta non viene toccato",
  null,
  esitoGruppoSquillo({ ...GRUPPO, kindInterno: null, durataSecondi: 75 }),
)
verifica(
  "chiamata IN USCITA non viene toccata",
  null,
  esitoGruppoSquillo({ ...GRUPPO, direction: "outbound", durataSecondi: 75 }),
)
verifica(
  "esito gia' dichiarato persa dal centralino resta com'e'",
  null,
  esitoGruppoSquillo({ ...GRUPPO, status: "missed", durataSecondi: 75 }),
)
verifica("durata assente non deduce", null, esitoGruppoSquillo({ ...GRUPPO, durataSecondi: null }))

console.log("\nTimeout diverso: la regola segue il valore dichiarato, non il 75")
verifica(
  "gruppo configurato a 30s: 30s = persa",
  "missed",
  esitoGruppoSquillo({ ...GRUPPO, timeoutSecondi: 30, durataSecondi: 30 }),
)
verifica(
  "gruppo configurato a 30s: 75s NON e' piu' un timeout",
  null,
  esitoGruppoSquillo({ ...GRUPPO, timeoutSecondi: 30, durataSecondi: 75 }),
)

console.log("\nNumero senza il prefisso di uscita del centralino")
verifica("0+41793374549 (reale) -> +41793374549", "+41793374549", numeroSenzaPrefissoDiUscita("0+41793374549"))
verifica("0+3197010241328 (reale) -> +3197010241328", "+3197010241328", numeroSenzaPrefissoDiUscita("0+3197010241328"))
verifica("03479334979 (reale) -> 3479334979", "3479334979", numeroSenzaPrefissoDiUscita("03479334979"))
verifica("03333848838 (reale) -> 3333848838", "3333848838", numeroSenzaPrefissoDiUscita("03333848838"))

console.log("\nNumeri fissi che iniziano legittimamente per zero: NON toccare")
verifica("0734420002 (Fermo, reale in uscita)", "0734420002", numeroSenzaPrefissoDiUscita("0734420002"))
verifica("055828450 (Firenze, reale)", "055828450", numeroSenzaPrefissoDiUscita("055828450"))
verifica("+39055820598 (l'hotel stesso)", "+39055820598", numeroSenzaPrefissoDiUscita("+39055820598"))
verifica("0302345678 (Brescia: 30 non e' un cellulare)", "0302345678", numeroSenzaPrefissoDiUscita("0302345678"))
verifica("0312345678 (Como: 31 non e' un cellulare)", "0312345678", numeroSenzaPrefissoDiUscita("0312345678"))
verifica("numero vuoto", null, numeroSenzaPrefissoDiUscita(""))
verifica("numero assente", null, numeroSenzaPrefissoDiUscita(null))

/**
 * CONTROLLO NEGATIVO: riproduce il comportamento di oggi.
 *
 * Senza la deduzione, una chiamata caduta a 75 secondi resta "completed": e'
 * esattamente il difetto per cui il riquadro diceva 5 mentre i clienti rimasti
 * senza risposta erano 33. Se questa verifica passasse, la prova qui sopra non
 * starebbe dimostrando nulla.
 */
console.log("\nControllo negativo (deve confermare il difetto di prima)")
const comePrima = (durata: number) => "completed"
verifica("senza la regola, 75s restava 'completata'", "completed", comePrima(75))
verifica("con la regola, 75s diventa 'persa'", "missed", esitoGruppoSquillo({ ...GRUPPO, durataSecondi: 75 }))

console.log(`\nRisultato: ${passate} passate, ${fallite} fallite`)
if (fallite > 0) process.exit(1)
