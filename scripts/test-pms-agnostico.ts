/**
 * Prova che l'impianto sia AGNOSTICO rispetto al PMS.
 *
 * Non verifica "Scidoo funziona": verifica che il resto del sistema non sappia
 * nulla di Scidoo, e che le scritture dipendano da quello che il connettore
 * DICHIARA di saper fare, non da quello che speriamo.
 *
 * Uso: npx tsx scripts/test-pms-agnostico.ts
 */

import {
  CAPACITA_PER_SCRITTURA,
  NESSUNA_CAPACITA,
  makeFakeProvider,
  scrittureNonSupportate,
  type PmsProvider,
  type PmsWrite,
} from "../lib/pms/provider"
import { connettoreEsiste, connettoriDisponibili, creaConnettore, baseUrlPredefinito } from "../lib/pms/connectors/registry"
import { traduciCliente } from "../lib/pms/connectors/scidoo"

let ok = 0
let ko = 0
function esito(descrizione: string, condizione: boolean, dettaglio = "") {
  if (condizione) {
    ok += 1
    console.log(`  OK   ${descrizione}`)
  } else {
    ko += 1
    console.log(`  KO   ${descrizione}${dettaglio ? ` -> ${dettaglio}` : ""}`)
  }
}

/** Un PMS immaginario che sa scrivere: serve a provare che il codice non sia tarato su Scidoo. */
function connettoreCheScrive(registro: PmsWrite[]): PmsProvider {
  return {
    slug: "pms-immaginario",
    name: "PMS immaginario",
    isFake: false,
    capabilities: { ...NESSUNA_CAPACITA, readGuests: true, writeContact: true, writeTags: true },
    limitations: ["Non gestisce le note."],
    testConnection: async () => ({ ok: true, detail: "va" }),
    listGuests: async () => ({ guests: [], nextCursor: null, scartati: [] }),
    applyWrite: async (w) => {
      registro.push(w)
      return { ok: true, detail: "scritto" }
    },
  }
}

console.log("\n=== 1) il registro e' l'unico posto che conosce i fornitori ===")
const disponibili = connettoriDisponibili()
esito("almeno un connettore registrato", disponibili.length >= 1, JSON.stringify(disponibili))
esito("scidoo e' riconosciuto", connettoreEsiste("scidoo"))
esito("un tipo inventato NON e' riconosciuto", !connettoreEsiste("pms-che-non-esiste"))
esito("tipo nullo NON e' riconosciuto", !connettoreEsiste(null))
esito("indirizzo predefinito noto per scidoo", (baseUrlPredefinito("scidoo") ?? "").startsWith("https://"))
esito("nessun indirizzo per un tipo sconosciuto", baseUrlPredefinito("altro") === null)

console.log("\n=== 2) un tipo sconosciuto si FERMA, non ripiega sui dati di prova ===")
// Se ripiegasse sul fornitore finto, una struttura con credenziali vere vedrebbe
// scorrere dati inventati credendoli i propri.
let lanciato = false
let messaggio = ""
try {
  creaConnettore("mio-pms", { baseUrl: "", authCode: "x", propertyCode: null, options: {} })
} catch (e) {
  lanciato = true
  messaggio = e instanceof Error ? e.message : String(e)
}
esito("costruire un tipo sconosciuto lancia", lanciato)
esito("il messaggio dice quale valore non e' riconosciuto", messaggio.includes("mio-pms"), messaggio)
esito("il messaggio elenca i tipi ammessi", messaggio.includes("scidoo"), messaggio)

console.log("\n=== 3) il connettore Scidoo dichiara i propri limiti, non li nasconde ===")
const scidoo = creaConnettore("scidoo", {
  baseUrl: "",
  authCode: "finto",
  propertyCode: "1",
  options: {},
})
esito("legge gli ospiti", scidoo.capabilities.readGuests === true)
esito("NON dichiara la scrittura anagrafica", scidoo.capabilities.writeContact === false)
esito("NON dichiara la scrittura consensi", scidoo.capabilities.writeConsent === false)
esito("dichiara i motivi a schermo", scidoo.limitations.length >= 3, `${scidoo.limitations.length} motivi`)
esito(
  "spiega che l'unico endpoint di scrittura e' il check-in",
  scidoo.limitations.some((l) => l.includes("guestCheckin")),
)

console.log("\n=== 4) una scrittura non supportata viene RIFIUTATA, non finta ===")
void (async () => {
  const rifiuto = await scidoo.applyWrite({ kind: "contact", pmsGuestId: "1", fields: { phone: "0550000" } })
  esito("Scidoo rifiuta la scrittura", rifiuto.ok === false)
  esito("e dice perche'", rifiuto.detail.length > 10, rifiuto.detail)

  const finto = makeFakeProvider()
  const rifiutoFinto = await finto.applyWrite({ kind: "contact", pmsGuestId: "1", fields: { phone: "0550000" } })
  esito("il fornitore di prova rifiuta di scrivere", rifiutoFinto.ok === false)

  console.log("\n=== 5) un PMS che SA scrivere viene servito dallo stesso codice ===")
  const registro: PmsWrite[] = []
  const immaginario = connettoreCheScrive(registro)
  const scritto = await immaginario.applyWrite({ kind: "contact", pmsGuestId: "9", fields: { phone: "055123" } })
  esito("la scrittura passa", scritto.ok === true)
  esito("ed e' arrivata davvero al connettore", registro.length === 1 && registro[0].kind === "contact")

  console.log("\n=== 6) gli interruttori impossibili vengono dichiarati ===")
  const tuttiAccesi = { contacts: true, tags: true, notes: true, consents: true }
  const avvisiScidoo = scrittureNonSupportate(scidoo, tuttiAccesi)
  esito("con Scidoo tutti e 4 gli interruttori risultano impossibili", avvisiScidoo.length === 4, `${avvisiScidoo.length}`)
  esito("gli avvisi nominano il fornitore", avvisiScidoo.every((a) => a.includes("Scidoo")))

  const avvisiImmaginario = scrittureNonSupportate(immaginario, tuttiAccesi)
  esito(
    "col PMS immaginario solo note e consensi sono impossibili",
    avvisiImmaginario.length === 2,
    avvisiImmaginario.join(" | "),
  )
  esito(
    "interruttori spenti non generano avvisi",
    scrittureNonSupportate(scidoo, { contacts: false, tags: false, notes: false, consents: false }).length === 0,
  )

  console.log("\n=== 7) la mappa scrittura->capacita' copre ogni tipo di scrittura ===")
  const tipi: Array<PmsWrite["kind"]> = ["contact", "tags", "note", "consent"]
  for (const t of tipi) {
    const capacita = CAPACITA_PER_SCRITTURA[t]
    esito(`"${t}" richiede una capacita' dichiarata`, Boolean(capacita) && capacita in NESSUNA_CAPACITA, String(capacita))
  }

  console.log("\n=== 8) la traduzione usa i campi VERI del manuale ===")
  // Campi copiati dall'esempio di bookings/get.php: l'identificativo e'
  // `guest_id` (documentato number, negli esempi stringa) e la cittadinanza
  // arriva come nome di nazione.
  const daManuale = traduciCliente({
    guest_id: "656911",
    first_name: "Pinco",
    last_name: "Pallino",
    city: "ASCOLI PICENO",
    citizenship: "ITALIA",
    email: null,
    phone: null,
    mobile: "+393281234567",
  })
  esito("l'ospite del manuale viene importato", daManuale !== null)
  esito("identificativo preso da guest_id", daManuale?.pmsGuestId === "656911", String(daManuale?.pmsGuestId))
  esito("nome e cognome uniti", daManuale?.name === "Pinco Pallino", String(daManuale?.name))
  esito("il cellulare vale quando telefono e' nullo", daManuale?.phone === "+393281234567", String(daManuale?.phone))
  esito("email nulla resta nulla, non stringa vuota", daManuale?.email === null, String(daManuale?.email))
  esito(
    "il consenso da Scidoo e' IGNOTO, mai un rifiuto",
    daManuale?.marketingConsent === null && daManuale?.gdprConsent === null,
    `${daManuale?.marketingConsent} / ${daManuale?.gdprConsent}`,
  )
  esito(
    "la cittadinanza in chiaro NON diventa una sigla inventata",
    daManuale?.country === null,
    String(daManuale?.country),
  )

  console.log("\n=== 9) guest_id numerico e valori mascherati ===")
  esito("guest_id numerico e' accettato", traduciCliente({ guest_id: 656911 })?.pmsGuestId === "656911")
  esito("senza guest_id si scarta", traduciCliente({ first_name: "luigi" }) === null)
  // Scidoo maschera i recapiti su alcuni canali: salvarli riempirebbe la rubrica
  // di indirizzi inesistenti che sembrano migliori del vuoto.
  const mascherato = traduciCliente({ guest_id: "1", email: "ma***@gmail.com", mobile: "+3932****567" })
  esito("email mascherata scartata", mascherato?.email === null, String(mascherato?.email))
  esito("cellulare mascherato scartato", mascherato?.phone === null, String(mascherato?.phone))

  console.log(`\n=== TOTALE: ${ok} ok, ${ko} ko ===`)
  if (ko > 0) process.exitCode = 1
})()
