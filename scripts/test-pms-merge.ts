/**
 * Prove delle regole di unione CRM <-> PMS.
 *
 * Si eseguono senza database e senza credenziali: servono a dimostrare che le
 * regole reggono sui casi che fanno danno (numero scritto in tre formati,
 * consenso revocato da un lato solo) PRIMA di collegare l'archivio vero.
 *
 *   pnpm test:pms-merge
 */

import {
  chiaveConfronto,
  decidiCampo,
  decidiConsenso,
  unisciTag,
  uniscoContattoEOspite,
  type CrmContact,
  type PmsGuest,
} from "../lib/pms/merge"

let passati = 0
let falliti = 0

function ok(nome: string, condizione: boolean, dettaglio = "") {
  if (condizione) {
    passati++
    console.log(`  ok   ${nome}`)
  } else {
    falliti++
    console.log(`  FAIL ${nome}${dettaglio ? ` -> ${dettaglio}` : ""}`)
  }
}

console.log("\n== Campo vuoto: si riempie ==")
{
  const d = decidiCampo("phone", null, "+39 055 8290022")
  ok("telefono mancante da noi viene riempito dal PMS", d.action === "fill", JSON.stringify(d))
  ok("il valore riempito e' quello del PMS", d.action === "fill" && d.value === "+39 055 8290022")
}

console.log("\n== Stesso numero scritto in modo diverso: NON e' un conflitto ==")
{
  // Questo e' il caso che, sbagliato, riempirebbe la coda di conflitti falsi a
  // ogni passata: lo stesso numero in due formati.
  for (const [nostro, pms] of [
    ["+39 055 8290022", "0558290022"],
    ["055 829 0022", "0039 055 8290022"],
    ["3351234567", "+39 335 1234567"],
  ] as const) {
    const d = decidiCampo("phone", nostro, pms)
    ok(`"${nostro}" = "${pms}"`, d.action === "none", JSON.stringify(d))
  }
  ok("email con maiuscole diverse non e' un conflitto", decidiCampo("email", "Info@Barronci.it", "info@barronci.it").action === "none")
  ok("nome con spazio doppio non e' un conflitto", decidiCampo("name", "Mario  Rossi", "Mario Rossi").action === "none")
}

console.log("\n== Numeri DAVVERO diversi: si affianca e si segnala ==")
{
  const d = decidiCampo("phone", "3351234567", "3339998877")
  ok("due numeri diversi generano un conflitto", d.action === "conflict", JSON.stringify(d))
  ok("il nostro valore resta quello in uso", d.action === "conflict" && d.keep === "3351234567")
  ok("l'altro viene conservato come alternativo", d.action === "conflict" && d.alternate === "3339998877")
}

console.log("\n== Il PMS non ha il dato: candidato alla scrittura di ritorno ==")
{
  const d = decidiCampo("phone", "3351234567", null)
  ok("se manca al PMS diventa 'push'", d.action === "push", JSON.stringify(d))
}

console.log("\n== Tag: si sommano, non si escludono ==")
{
  const t = unisciTag(["cliente abituale"], ["Booking", "CLIENTE ABITUALE"])
  ok("unione senza doppioni (maiuscole ignorate)", t.uniti.length === 2, JSON.stringify(t.uniti))
  ok("da aggiungere in rubrica solo 'Booking'", t.daAggiungereInCrm.length === 1 && /booking/i.test(t.daAggiungereInCrm[0]!))
  ok("niente da scrivere nel PMS: li ha entrambi", t.daScrivereNelPms.length === 0, JSON.stringify(t.daScrivereNelPms))
}

console.log("\n== Consensi: LA REVOCA VINCE (il caso che fa danno) ==")
{
  // Ospite disiscritto da noi, ma nel PMS il consenso e' ancora acceso.
  // Sincronizzando "come un campo normale" tornerebbe iscritto: inaccettabile.
  const d = decidiConsenso("marketing", { valore: true, dichiarato: true, disiscritto: true }, true)
  ok("disiscritto da noi => risultato NO", d.risultato === false, JSON.stringify(d))
  ok("la revoca viene portata anche nel PMS", d.scriviNelPms === true, JSON.stringify(d))
  ok("motivo dichiarato: revoca_vince", d.motivo === "revoca_vince")

  const d2 = decidiConsenso("marketing", { valore: false, dichiarato: true }, true)
  ok("NO dichiarato da noi batte SI' del PMS", d2.risultato === false && d2.scriviNelPms === true)

  const d3 = decidiConsenso("marketing", { valore: true, dichiarato: true }, false)
  ok("NO del PMS batte SI' nostro", d3.risultato === false && d3.cambiaInCrm === true)

  const d4 = decidiConsenso("marketing", { valore: null, dichiarato: false }, false)
  ok(
    "ignoto da noi + NO del PMS => scriviamo NO esplicito",
    d4.risultato === false && d4.cambiaInCrm === true,
    JSON.stringify(d4),
  )
}

console.log("\n== Consensi: un NO NON dichiarato non e' una revoca (difetto misurato) ==")
{
  // MISURATO: su Villa I Barronci `marketing_consent` e' false su 878/878.
  // E' il valore predefinito della colonna, non la scelta di 878 persone.
  // Se lo trattassimo come revoca, spegneremmo consensi VERI dentro Scidoo.
  const d = decidiConsenso("marketing", { valore: false, dichiarato: false }, true)
  ok(
    "false non dichiarato + SI' del PMS => il SI' vince (NON si spegne il PMS)",
    d.risultato === true && d.scriviNelPms === false,
    JSON.stringify(d),
  )
  ok("il consenso viene recepito da noi", d.cambiaInCrm === true && d.motivo === "concesso_da_pms")
  ok("ed e' dichiarato che il nostro NO e' stato ignorato", d.nostroNoIgnorato === true)

  // Il controllo opposto: con la prova, la revoca deve ancora vincere.
  const d2 = decidiConsenso("marketing", { valore: false, dichiarato: true }, true)
  ok(
    "con prova documentata la revoca vince ancora",
    d2.risultato === false && d2.scriviNelPms === true && d2.nostroNoIgnorato === false,
    JSON.stringify(d2),
  )

  // La disiscrizione e' un gesto: vale anche senza registro dei consensi.
  const d3 = decidiConsenso("marketing", { valore: false, dichiarato: false, disiscritto: true }, true)
  ok("la disiscrizione vale come revoca anche senza registro", d3.risultato === false, JSON.stringify(d3))

  const d4 = decidiConsenso("gdpr", { valore: false, dichiarato: false }, null)
  ok(
    "false non dichiarato e PMS muto => nessuna scrittura da nessun lato",
    d4.cambiaInCrm === false && d4.scriviNelPms === false,
    JSON.stringify(d4),
  )
}

console.log("\n== Consensi: il SI' si propaga solo senza un NO esplicito ==")
{
  const d = decidiConsenso("marketing", { valore: null, dichiarato: false }, true)
  ok("SI' del PMS su campo ignoto => lo recepiamo", d.risultato === true && d.cambiaInCrm === true, JSON.stringify(d))

  const d2 = decidiConsenso("marketing", { valore: true, dichiarato: true }, null)
  ok("SI' nostro su campo ignoto del PMS => glielo scriviamo", d2.risultato === true && d2.scriviNelPms === true)

  const d3 = decidiConsenso("gdpr", { valore: null, dichiarato: false }, null)
  ok(
    "nessuno dichiara nulla => NON si inventa un consenso",
    d3.risultato === false && d3.cambiaInCrm === false && d3.scriviNelPms === false,
    JSON.stringify(d3),
  )

  const d4 = decidiConsenso("gdpr", { valore: true, dichiarato: true }, true)
  ok(
    "gia' allineati => nessuna scrittura",
    d4.cambiaInCrm === false && d4.scriviNelPms === false && d4.motivo === "gia_allineati",
  )
}

console.log("\n== Caso completo su dati simili a quelli veri ==")
{
  // Il caso reale di Villa I Barronci: contatto nato da un'email, con nome ed
  // email ma SENZA telefono (872 su 877 sono cosi').
  const contatto: CrmContact = {
    id: "c1",
    name: "Mario Rossi",
    email: "mario.rossi@example.com",
    phone: null,
    city: null,
    tags: ["email"],
    marketingConsent: null,
    unsubscribed: false,
  }
  const ospite: PmsGuest = {
    pmsGuestId: "G-1001",
    name: "Mario Rossi",
    email: "MARIO.ROSSI@example.com",
    phone: "+39 335 1234567",
    city: "Firenze",
    tags: ["Booking"],
    marketingConsent: true,
  }
  const e = uniscoContattoEOspite(contatto, ospite)

  ok("il telefono mancante viene riempito", e.daRiempire.phone === "+39 335 1234567", JSON.stringify(e.daRiempire))
  ok("la citta' mancante viene riempita", e.daRiempire.city === "Firenze")
  ok("l'email con maiuscole diverse NON e' un conflitto", e.conflitti.length === 0, JSON.stringify(e.conflitti))
  ok("il tag del PMS si aggiunge", e.tag.daAggiungereInCrm.includes("Booking"))
  ok("il nostro tag va scritto nel PMS", e.tag.daScrivereNelPms.includes("email"))
  ok("il consenso marketing del PMS viene recepito", e.consensi.some((c) => c.kind === "marketing" && c.risultato === true && c.cambiaInCrm))
}

console.log("\n== Controllo NEGATIVO: la sonda sa fallire? ==")
{
  // Se questo non fallisse, tutte le prove sopra non dimostrerebbero nulla.
  const finto = chiaveConfronto("phone", "3351234567") === chiaveConfronto("phone", "3339998877")
  ok("due numeri diversi NON hanno la stessa chiave", finto === false)
}

console.log(`\n${falliti === 0 ? "TUTTE PASSATE" : "CI SONO FALLIMENTI"}: ${passati} ok, ${falliti} fallite\n`)
process.exit(falliti === 0 ? 0 : 1)
