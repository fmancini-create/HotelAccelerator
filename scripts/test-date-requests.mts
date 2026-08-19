/**
 * Prove sulla traduzione estrazione -> richiesta di date, e sulle fasi.
 *
 * Esegue il codice VERO (`lib/crm/date-requests.ts`), non una copia della
 * logica: una prova che riproduce le regole invece di chiamarle passa anche
 * quando il modulo è rotto.
 *
 *   npx tsx scripts/test-date-requests.mts [--sabotaggi]
 *
 * Con `--sabotaggi` reintroduce i difetti noti nel file e pretende che le prove
 * arrossiscano. Una prova che non sa fallire non protegge niente.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import {
  traduciEstrazione,
  faseDi,
  nottiDa,
  provenienzaDa,
  acquisitaDalSito,
  riferimentoStabile,
  FASI,
  type EstrazioneDomanda,
} from "../lib/crm/date-requests"

const FILE_LOGICA = "lib/crm/date-requests.ts"

let passate = 0
const fallite: string[] = []

function esigi(cosa: string, condizione: boolean) {
  if (condizione) passate++
  else fallite.push(cosa)
}

function uguale(cosa: string, avuto: unknown, atteso: unknown) {
  const a = JSON.stringify(avuto)
  const b = JSON.stringify(atteso)
  if (a === b) passate++
  else fallite.push(`${cosa}: atteso ${b}, avuto ${a}`)
}

/* ── Dati di prova copiati dai payload VERI misurati in archivio ── */

const scidoo: EstrazioneDomanda = {
  id: "11111111-1111-1111-1111-111111111111",
  property_id: "c16ad260-2c34-4544-9909-5cd444773986",
  conversation_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  kind: "prenotazione_camera",
  method: "regole:scidoo",
  payload: { tipo: "prenotazione", esito: "confermata", notti: 5, arrivo: "2026-11-01", ospiti: 2, partenza: "2026-11-06" },
}

const personaConDate: EstrazioneDomanda = {
  id: "22222222-2222-2222-2222-222222222222",
  property_id: "c16ad260-2c34-4544-9909-5cd444773986",
  conversation_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  kind: "domanda",
  method: "modello",
  payload: { esito: "aperta", arrivo: "2026-08-16", ospiti: null, partenza: "2026-08-17" },
}

const personaSenzaDate: EstrazioneDomanda = {
  id: "33333333-3333-3333-3333-333333333333",
  property_id: "c16ad260-2c34-4544-9909-5cd444773986",
  conversation_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  kind: "domanda",
  method: "modello",
  payload: { esito: "aperta", arrivo: null, ospiti: null, partenza: null },
}

const nessunaDomanda: EstrazioneDomanda = {
  id: "44444444-4444-4444-4444-444444444444",
  property_id: "c16ad260-2c34-4544-9909-5cd444773986",
  conversation_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  kind: "nessuna_domanda",
  method: "esclusione",
  payload: { motivo: "mittente_automatico" },
}

/* ────────────────────────── Le prove ────────────────────────── */

// 1. Provenienza: decide in quale blocco finisce la riga.
uguale("provenienza scidoo", provenienzaDa("regole:scidoo"), "scidoo")
uguale("provenienza myrestoo", provenienzaDa("regole:myrestoo"), "myrestoo")
uguale("provenienza modello", provenienzaDa("modello"), "conversazione")
uguale("provenienza method assente", provenienzaDa(null), "conversazione")
esigi("scidoo è acquisita dal sito", acquisitaDalSito("scidoo") === true)
esigi("conversazione NON è acquisita dal sito", acquisitaDalSito("conversazione") === false)

// 2. Traduzione di una conferma del gestionale.
const rScidoo = traduciEstrazione(scidoo, "contatto-1")!
esigi("scidoo tradotta", rScidoo !== null)
uguale("scidoo source", rScidoo.source, "scidoo")
uguale("scidoo arrivo", rScidoo.requested_check_in, "2026-11-01")
uguale("scidoo notti dal payload", rScidoo.nights, 5)
uguale("scidoo ospiti", rScidoo.guests_adults, 2)
uguale("scidoo esito", rScidoo.outcome, "confermata")
// I bambini non sono mai nel payload: NULL significa "non rilevato", 0 direbbe
// "zero bambini". Sono due affermazioni diverse.
uguale("scidoo bambini restano NULL", rScidoo.guests_children, null)
uguale("scidoo tipo camera resta NULL", rScidoo.room_type_requested, null)

// 3. Richiesta di una persona con date: le notti NON sono nel payload e vanno
//    calcolate, altrimenti la colonna resterebbe vuota proprio sulle righe che
//    contano.
const rPersona = traduciEstrazione(personaConDate, "contatto-2")!
uguale("persona source", rPersona.source, "conversazione")
uguale("persona notti calcolate", rPersona.nights, 1)
uguale("persona ospiti null resta null", rPersona.guests_adults, null)

// 4. Richiesta senza date: si tiene, perché è lavoro da fare.
const rSenza = traduciEstrazione(personaSenzaDate, "contatto-3")!
esigi("richiesta senza date NON viene scartata", rSenza !== null)
uguale("senza date: arrivo null", rSenza.requested_check_in, null)
uguale("senza date: notti null", rSenza.nights, null)
uguale("senza date: esito conservato", rSenza.outcome, "aperta")

// 5. Ciò che non è una richiesta non entra.
uguale("nessuna_domanda scartata", traduciEstrazione(nessunaDomanda, null), null)
uguale(
  "payload senza date e senza esito scartato",
  traduciEstrazione({ ...personaSenzaDate, payload: { arrivo: null, esito: null } }, null),
  null,
)
uguale("payload assente scartato", traduciEstrazione({ ...personaSenzaDate, payload: null }, null), null)

// 6. Idempotenza: la stessa domanda riletta a una nuova versione di
//    configurazione produce un id nuovo ma la STESSA chiave.
const chiave1 = riferimentoStabile(personaConDate, "2026-08-16", "2026-08-17")
const chiave2 = riferimentoStabile({ ...personaConDate, id: "id-diverso" }, "2026-08-16", "2026-08-17")
uguale("chiave stabile fra riletture", chiave1, chiave2)
esigi("chiave diversa se cambiano le date", riferimentoStabile(personaConDate, "2026-09-01", null) !== chiave1)
esigi("senza conversazione si ripiega sull'id", riferimentoStabile({ id: "x", conversation_id: null }, null, null).includes("x"))

// 7. Notti: dichiarate battono calcolate; senza date resta null.
uguale("notti dichiarate vincono", nottiDa({ notti: 3 }, "2026-01-01", "2026-01-10"), 3)
uguale("notti calcolate", nottiDa({}, "2026-01-01", "2026-01-04"), 3)
uguale("notti senza partenza", nottiDa({}, "2026-01-01", null), null)
uguale("notti negative scartate", nottiDa({}, "2026-01-10", "2026-01-01"), null)

// 8. Fasi: la precedenza è la parte che sbaglia in silenzio.
uguale("esito confermata", faseDi({ outcome: "confermata", quoted_rate_cents: null }), "confermata")
uguale("esito aperta", faseDi({ outcome: "aperta", quoted_rate_cents: null }), "aperta")
uguale("esito assente", faseDi({ outcome: null, quoted_rate_cents: null }), "da_qualificare")
uguale("tariffa a mano su aperta", faseDi({ outcome: "aperta", quoted_rate_cents: 45000 }), "preventivo_inviato")
// Una vendita non retrocede perché qualcuno ha scritto una cifra.
uguale("confermata vince sulla tariffa", faseDi({ outcome: "confermata", quoted_rate_cents: 45000 }), "confermata")
uguale("persa vince sulla tariffa", faseDi({ outcome: "persa", quoted_rate_cents: 45000 }), "persa")
uguale("tariffa a zero non è un preventivo", faseDi({ outcome: "aperta", quoted_rate_cents: 0 }), "aperta")

// 9. Le fasi raggiungibili sono dichiarate visibili; "persa" no, perché
//    l'estrattore non la produce (misurato: solo aperta/confermata/null).
uguale("persa non è sempre visibile", FASI.find((f) => f.key === "persa")!.sempreVisibile, false)
uguale("le altre quattro sono visibili", FASI.filter((f) => f.sempreVisibile).length, 4)

/* ─────────────────────── Esito e sabotaggi ─────────────────────── */

if (!process.argv.includes("--sabotaggi")) {
  console.log(`  prove passate: ${passate}`)
  if (fallite.length) {
    console.log(`  FALLITE: ${fallite.length}`)
    fallite.forEach((f) => console.log(`    - ${f}`))
    process.exit(1)
  }
  console.log("  tutte verdi")
  process.exit(0)
}

/* Con --sabotaggi: si rompe il file vero e si pretende il rosso. */

const originale = readFileSync(FILE_LOGICA, "utf8")

const sabotaggi: Array<[string, (s: string) => string]> = [
  [
    "scidoo classificata come conversazione (i due blocchi si fonderebbero)",
    (s) => s.replace('if (m.startsWith("regole:scidoo")) return "scidoo"', ""),
  ],
  [
    "la tariffa a mano vince sull'esito confermata (una vendita retrocede)",
    (s) =>
      s.replace(
        'if (esito === "confermata" || esito === "confirmed") return "confermata"',
        "",
      ),
  ],
  [
    "richieste senza date scartate (spariscono 10 richieste aperte)",
    (s) => s.replace("if (!arrivo && !esito) return null", "if (!arrivo) return null"),
  ],
  [
    "bambini scritti a 0 invece di NULL (afferma zero bambini)",
    (s) => s.replace("guests_children: null", "guests_children: 0"),
  ],
  [
    "notti non calcolate quando mancano nel payload",
    (s) => s.replace("nights: nottiDa(payload, arrivo, partenza)", "nights: numeroOppureNull(payload.notti)"),
  ],
  [
    "chiave basata sull'id (ogni rilettura duplicherebbe la pipeline)",
    (s) => s.replace("return `conv:${e.conversation_id}|${arrivo ?? \"senza-arrivo\"}|${partenza ?? \"senza-partenza\"}`", "return `estrazione:${e.id}`"),
  ],
  [
    "tariffa a zero considerata un preventivo",
    (s) => s.replace("riga.quoted_rate_cents !== null && riga.quoted_rate_cents > 0", "riga.quoted_rate_cents !== null"),
  ],
  [
    "notti negative accettate (partenza prima dell'arrivo)",
    (s) => s.replace("Number.isFinite(giorni) && giorni > 0", "Number.isFinite(giorni)"),
  ],
]

let applicati = 0
let colti = 0
const nonApplicati: string[] = []

for (const [nome, rompi] of sabotaggi) {
  const rotto = rompi(originale)
  if (rotto === originale) {
    // Guardia: un sabotaggio che non cambia il file misura la prova, non il
    // codice. Senza questo controllo si leggerebbe "0 sfuggiti" e sembrerebbe
    // un successo.
    nonApplicati.push(nome)
    continue
  }
  applicati++
  writeFileSync(FILE_LOGICA, rotto)
  let uscita = 0
  try {
    execFileSync("npx", ["--yes", "tsx", "scripts/test-date-requests.mts"], { stdio: "pipe" })
  } catch (e: unknown) {
    uscita = (e as { status?: number }).status ?? 1
  }
  console.log(`  ${uscita !== 0 ? "COLTO   " : "SFUGGITO"} -> ${nome}`)
  if (uscita !== 0) colti++
  writeFileSync(FILE_LOGICA, originale)
}

writeFileSync(FILE_LOGICA, originale)
const ripristinato = readFileSync(FILE_LOGICA, "utf8") === originale

console.log(`\n  dichiarati ${sabotaggi.length}, applicati ${applicati}, colti ${colti}`)
console.log(`  file ripristinato identico: ${ripristinato}`)
if (nonApplicati.length) {
  console.log("  NON APPLICATI (riga inventata, da correggere):")
  nonApplicati.forEach((n) => console.log(`    - ${n}`))
}
process.exit(nonApplicati.length === 0 && colti === applicati && ripristinato ? 0 : 1)
