/**
 * Prova dell'ora dei turni: quello che l'utente scrive deve essere quello che
 * l'utente rilegge, anche a cavallo del cambio di ora legale.
 *
 *   pnpm exec tsx scripts/test-hr-time.ts
 */
import { giornoItaliano, inizioGiornoItaliano, istanteDaOraItaliana } from "@/lib/hr/time"

let passati = 0
let falliti = 0

function verifica(nome: string, atteso: string, ottenuto: string) {
  const ok = atteso === ottenuto
  if (ok) passati++
  else falliti++
  console.log(`  ${ok ? "PASS" : "FALLITO"}  ${nome}\n          atteso ${atteso} | ottenuto ${ottenuto}`)
}

/** Come un browser italiano rimostra l'istante salvato. */
function comeLoLeggeUnItaliano(istante: Date): string {
  return istante.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
}

console.log("\n=== andata e ritorno: l'ora scritta e' l'ora riletta ===")
for (const [giorno, ora, stagione] of [
  ["2026-08-20", "07:30", "ora legale (+2)"],
  ["2026-01-15", "07:30", "ora solare (+1)"],
  ["2026-08-20", "23:45", "sera, ora legale"],
  ["2026-01-15", "00:15", "notte, ora solare"],
] as const) {
  verifica(`${ora} del ${giorno} — ${stagione}`, ora, comeLoLeggeUnItaliano(istanteDaOraItaliana(giorno, ora)))
}

console.log("\n=== lo scarto e' davvero diverso fra le stagioni ===")
verifica(
  "07:30 estivo salvato in UTC",
  "2026-08-20T05:30:00.000Z",
  istanteDaOraItaliana("2026-08-20", "07:30").toISOString(),
)
verifica(
  "07:30 invernale salvato in UTC",
  "2026-01-15T06:30:00.000Z",
  istanteDaOraItaliana("2026-01-15", "07:30").toISOString(),
)

console.log("\n=== giorni di cambio orario (2026: 29 marzo e 25 ottobre) ===")
verifica("mattina del 29/03 dopo il salto", "07:00", comeLoLeggeUnItaliano(istanteDaOraItaliana("2026-03-29", "07:00")))
verifica("mattina del 25/10 dopo il ritorno", "07:00", comeLoLeggeUnItaliano(istanteDaOraItaliana("2026-10-25", "07:00")))

console.log("\n=== turno notturno: fine il giorno dopo ===")
const inizio = istanteDaOraItaliana("2026-08-20", "22:00")
const fine = istanteDaOraItaliana("2026-08-21", "06:00")
verifica("durata del turno in ore", "8", String((fine.getTime() - inizio.getTime()) / 3_600_000))
verifica("il turno finisce dopo l'inizio", "true", String(fine > inizio))

console.log("\n=== giorno italiano di un istante ===")
verifica("22:30 UTC del 20/08 e' gia' il 21 in Italia", "2026-08-21", giornoItaliano("2026-08-20T22:30:00.000Z"))
verifica("mezzanotte italiana del 20/08", "2026-08-19T22:00:00.000Z", inizioGiornoItaliano("2026-08-20").toISOString())

console.log("\n=== CONTROLLO NEGATIVO: il test sa fallire? ===")
const sbagliato = new Date("2026-08-20T07:30:00.000Z") // come faceva il codice prima
const letto = comeLoLeggeUnItaliano(sbagliato)
console.log(`  il vecchio calcolo mostrava ${letto} invece di 07:30`)
if (letto === "07:30") {
  console.log("  FALLITO: il controllo negativo non distingue il difetto, la prova non vale")
  falliti++
} else {
  console.log("  PASS  il difetto sarebbe stato rilevato")
  passati++
}

console.log(`\nPassati: ${passati} | Falliti: ${falliti}`)
process.exit(falliti === 0 ? 0 : 1)
