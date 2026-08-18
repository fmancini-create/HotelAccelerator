/**
 * Contratto delle sorgenti statistiche e delle performance operatori.
 *
 * Verifica ESEGUENDO le funzioni vere contro una base dati finta, non leggendo i
 * file come testo: una prova testuale da' verde anche su codice che non compila, e
 * mi e' gia' costata un falso verde su questo stesso cruscotto.
 *
 * Cose che il compilatore non puo' vedere e che qui si misurano:
 *
 *  - nessuna riga di scelta = TUTTE le sorgenti contano (una tabella vuota non
 *    deve azzerare i cruscotti);
 *  - una casella esclusa sparisce dai conteggi, e le altre restano;
 *  - un autore non piu' in anagrafica NON diventa un operatore fantasma in cima
 *    alla classifica (misurato: succede davvero su questa struttura);
 *  - l'IA sta fuori graduatoria (risponde in 2 secondi: vincerebbe sempre);
 *  - sotto la soglia la graduatoria si dichiara non disponibile;
 *  - la mediana non e' la media (con 109 e 3.067 minuti la media direbbe 1.588);
 *  - la conversione resta dichiarata come non disponibile, mai stimata.
 *
 * Si esegue con: pnpm check:analytics
 */

import { canaleIncluso, listAnalyticsSources } from "../lib/platform/analytics-sources"
import { computeOperatorPerformance, SOGLIA_GRADUATORIA } from "../lib/platform/operator-performance"

let passed = 0
let failed = 0

function check(nome: string, condizione: boolean, dettaglio = "") {
  if (condizione) {
    passed++
    console.log(`    ok   ${nome}`)
  } else {
    failed++
    console.log(`  FAIL   ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`)
  }
}

const PROP = "prop-1"
const ORA = Date.now()
const fa = (minuti: number) => new Date(ORA - minuti * 60000).toISOString()

/** Dati finti che riproducono la forma reale misurata su questa struttura. */
type Mondo = {
  scelte: Array<{ source_kind: string; source_id: string; included: boolean }>
  caselle: Array<{ id: string; display_name: string; email_address: string }>
  canali: Array<{ id: string; display_name: string; channel_type: string }>
  conversazioni: Array<{ id: string; channel: string; channel_id: string | null }>
  messaggi: Array<{
    id: string
    conversation_id: string
    sender_type: string
    sender_id: string | null
    created_at: string
    metadata: Record<string, unknown> | null
  }>
  utenti: Array<{ id: string; email: string; name: string }>
}

/**
 * Finto client Supabase: interpreta la catena di chiamate che il codice usa
 * davvero. Se il codice cambiasse tabella o colonna, qui non troverebbe i dati e
 * la prova diventerebbe rossa: e' voluto.
 */
function fintoClient(m: Mondo) {
  const tabelle: Record<string, any[]> = {
    analytics_source_selection: m.scelte,
    email_channels: m.caselle,
    messaging_channels: m.canali,
    conversations: m.conversazioni,
    messages: m.messaggi,
    admin_users: m.utenti,
  }

  return {
    from(tabella: string) {
      let righe = [...(tabelle[tabella] ?? [])]
      let contaEsatta = false

      const api: any = {
        select(_campi: string, opzioni?: { count?: string; head?: boolean }) {
          if (opzioni?.count === "exact") contaEsatta = true
          return api
        },
        eq(col: string, val: unknown) {
          righe = righe.filter((r) => r[col] === val)
          return api
        },
        neq(col: string, val: unknown) {
          righe = righe.filter((r) => r[col] !== val)
          return api
        },
        gte(col: string, val: string) {
          righe = righe.filter((r) => String(r[col]) >= String(val))
          return api
        },
        in(col: string, valori: unknown[]) {
          righe = righe.filter((r) => valori.includes(r[col]))
          return api
        },
        not(col: string, _op: string, _val: unknown) {
          righe = righe.filter((r) => r[col] !== null && r[col] !== undefined)
          return api
        },
        order() {
          return api
        },
        then(risolvi: (v: unknown) => void) {
          // `property_id` non e' nei dati finti: il filtro per struttura e' gia'
          // implicito, qui interessa la logica di selezione e attribuzione.
          risolvi(contaEsatta ? { data: null, count: righe.length, error: null } : { data: righe, error: null })
        },
      }
      return api
    },
  } as any
}

/** Mondo di base: 2 caselle email, 1 canale WhatsApp, nessuna scelta salvata. */
function mondoBase(): Mondo {
  return {
    scelte: [],
    caselle: [
      { id: "cas-hotel", display_name: "Hotel", email_address: "info@hotel.it" },
      { id: "cas-privata", display_name: "Personale", email_address: "io@gmail.com" },
    ],
    canali: [{ id: "can-wa", display_name: "WhatsApp", channel_type: "whatsapp" }],
    conversazioni: [
      { id: "c1", channel: "email", channel_id: "cas-hotel" },
      { id: "c2", channel: "email", channel_id: "cas-privata" },
      { id: "c3", channel: "whatsapp", channel_id: null },
    ],
    messaggi: [],
    utenti: [{ id: "u-vera", email: "vera@hotel.it", name: "Persona Vera" }],
  }
}

async function main() {
  console.log("\n  Sorgenti statistiche\n")

  // 1. Nessuna scelta salvata = tutto incluso.
  {
    const m = mondoBase()
    const r = await listAnalyticsSources(fintoClient(m), PROP)
    check("nessuna scelta: tutte le sorgenti contano", r.filter.tutteIncluse === true)
    check("nessuna scelta: nessuna esclusa", r.filter.escluse === 0)
    check("nessuna scelta: elenca tutte e 3 le sorgenti", r.sources.length === 3, `trovate ${r.sources.length}`)
    check("nessuna scelta: il canale whatsapp e' ammesso", canaleIncluso(r.filter, "whatsapp") === true)
  }

  // 2. Una casella esclusa: sparisce lei, non le altre.
  {
    const m = mondoBase()
    m.scelte = [{ source_kind: "email_channel", source_id: "cas-privata", included: false }]
    const r = await listAnalyticsSources(fintoClient(m), PROP)
    check("casella esclusa: risulta 1 esclusa", r.filter.escluse === 1, `escluse=${r.filter.escluse}`)
    check("casella esclusa: non e' piu' 'tutte incluse'", r.filter.tutteIncluse === false)
    check(
      "casella esclusa: l'altra casella resta nel filtro",
      r.filter.emailChannelIds?.includes("cas-hotel") === true,
    )
    check(
      "casella esclusa: la casella esclusa NON e' nel filtro",
      r.filter.emailChannelIds?.includes("cas-privata") === false,
    )
    check("casella esclusa: whatsapp non ne soffre", canaleIncluso(r.filter, "whatsapp") === true)
  }

  // 3. Canale di messaggistica escluso.
  {
    const m = mondoBase()
    m.scelte = [{ source_kind: "messaging_channel", source_id: "can-wa", included: false }]
    const r = await listAnalyticsSources(fintoClient(m), PROP)
    check("canale escluso: whatsapp non e' piu' ammesso", canaleIncluso(r.filter, "whatsapp") === false)
    check("canale escluso: l'email resta ammessa", canaleIncluso(r.filter, "email") === true)
  }

  // 4. Tutto escluso: lo zero e' voluto e va dichiarato.
  {
    const m = mondoBase()
    m.scelte = [
      { source_kind: "email_channel", source_id: "cas-hotel", included: false },
      { source_kind: "email_channel", source_id: "cas-privata", included: false },
      { source_kind: "messaging_channel", source_id: "can-wa", included: false },
    ]
    const r = await listAnalyticsSources(fintoClient(m), PROP)
    check("tutto escluso: dichiarato come 'nessuna inclusa'", r.filter.nessunaInclusa === true)
  }

  console.log("\n  Performance operatori\n")

  // 5. Autore fantasma: non deve diventare un operatore.
  {
    const m = mondoBase()
    m.messaggi = [
      // domanda del cliente
      { id: "m0", conversation_id: "c1", sender_type: "customer", sender_id: null, created_at: fa(70), metadata: null },
      // risposta di un id NON presente in admin_users, veloce: il caso reale
      {
        id: "m1",
        conversation_id: "c1",
        sender_type: "agent",
        sender_id: "u-fantasma",
        created_at: fa(69),
        metadata: null,
      },
    ]
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 30)
    const persone = r.righe.filter((x) => x.genere === "persona")
    check("autore fantasma: nessuna persona in elenco", persone.length === 0, `persone=${persone.length}`)
    const nonAttr = r.righe.find((x) => x.genere === "non-attribuite")
    check("autore fantasma: confluisce nelle non attribuite", nonAttr?.risposte === 1, `risposte=${nonAttr?.risposte}`)
    check("autore fantasma: non compare col suo id", !r.righe.some((x) => x.id === "u-fantasma"))
  }

  // 6. IA fuori graduatoria.
  {
    const m = mondoBase()
    m.messaggi = [
      { id: "m0", conversation_id: "c1", sender_type: "customer", sender_id: null, created_at: fa(70), metadata: null },
      {
        id: "m1",
        conversation_id: "c1",
        sender_type: "agent",
        sender_id: null,
        created_at: fa(69),
        metadata: { ai_autopilot: true },
      },
    ]
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 30)
    const ia = r.righe.find((x) => x.genere === "ia")
    check("IA: compare come riga a se'", ia?.risposte === 1, `ia=${ia?.risposte}`)
    check("IA: non e' contata fra le umane attribuite", r.risposteUmaneAttribuite === 0)
    check("IA: non compare come persona", !r.righe.some((x) => x.genere === "persona"))
    check("IA: non entra in graduatoria", ia?.inGraduatoria !== true)
  }

  // 7. Soglia: sotto il minimo la graduatoria si dichiara non disponibile.
  {
    const m = mondoBase()
    m.messaggi = [
      { id: "m0", conversation_id: "c1", sender_type: "customer", sender_id: null, created_at: fa(70), metadata: null },
      {
        id: "m1",
        conversation_id: "c1",
        sender_type: "agent",
        sender_id: "u-vera",
        created_at: fa(69),
        metadata: null,
      },
    ]
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 30)
    check("soglia: graduatoria dichiarata non disponibile", r.graduatoriaNonDisponibile === true)
    check("soglia: la persona compare comunque coi suoi numeri", r.righe.some((x) => x.nome === "Persona Vera"))
    check(
      "soglia: la persona e' marcata fuori graduatoria",
      r.righe.find((x) => x.genere === "persona")?.inGraduatoria === false,
    )
    check("soglia: il valore e' pubblicato come dato", r.soglia === SOGLIA_GRADUATORIA)
  }

  // 8. Mediana, non media.
  {
    const m = mondoBase()
    // attese di 10, 20 e 3000 minuti: mediana 20, media 1010.
    m.messaggi = [
      { id: "q1", conversation_id: "c1", sender_type: "customer", sender_id: null, created_at: fa(3010), metadata: null },
      { id: "r1", conversation_id: "c1", sender_type: "agent", sender_id: "u-vera", created_at: fa(10), metadata: null },
      { id: "q2", conversation_id: "c2", sender_type: "customer", sender_id: null, created_at: fa(30), metadata: null },
      { id: "r2", conversation_id: "c2", sender_type: "agent", sender_id: "u-vera", created_at: fa(20), metadata: null },
      { id: "q3", conversation_id: "c3", sender_type: "customer", sender_id: null, created_at: fa(30), metadata: null },
      { id: "r3", conversation_id: "c3", sender_type: "agent", sender_id: "u-vera", created_at: fa(20), metadata: null },
    ]
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 30)
    const p = r.righe.find((x) => x.genere === "persona")
    const minuti = p?.attesaMedianaSec === null ? null : Math.round((p!.attesaMedianaSec as number) / 60)
    check("mediana: vale 10 minuti, non la media 1.010", minuti === 10, `letto ${minuti} min`)
    check("mediana: il denominatore e' pubblicato", p?.attesaSu === 3, `attesaSu=${p?.attesaSu}`)
  }

  // 9. Il filtro sorgenti vale anche per le performance.
  {
    const m = mondoBase()
    m.scelte = [{ source_kind: "email_channel", source_id: "cas-privata", included: false }]
    m.messaggi = [
      { id: "q1", conversation_id: "c1", sender_type: "customer", sender_id: null, created_at: fa(70), metadata: null },
      { id: "r1", conversation_id: "c1", sender_type: "agent", sender_id: "u-vera", created_at: fa(69), metadata: null },
      // questa sta nella casella ESCLUSA: non deve contare
      { id: "q2", conversation_id: "c2", sender_type: "customer", sender_id: null, created_at: fa(70), metadata: null },
      { id: "r2", conversation_id: "c2", sender_type: "agent", sender_id: "u-vera", created_at: fa(69), metadata: null },
    ]
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 30)
    const p = r.righe.find((x) => x.genere === "persona")
    check("filtro: la risposta nella casella esclusa non conta", p?.risposte === 1, `risposte=${p?.risposte}`)
    check("filtro: le sorgenti escluse sono dichiarate", r.sorgentiEscluse === 1)
  }

  // 10. La conversione non si inventa mai.
  {
    const m = mondoBase()
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 30)
    check("conversione: dichiarata non disponibile", r.conversione.disponibile === false)
    check("conversione: il motivo e' scritto", typeof r.conversione.motivo === "string" && r.conversione.motivo.length > 20)
  }

  // 11. La finestra e' un dato pubblicato, non una promessa nel testo.
  {
    const m = mondoBase()
    const r = await computeOperatorPerformance(fintoClient(m), PROP, 7)
    check("finestra: pubblicata come dato", r.giorni === 7, `giorni=${r.giorni}`)
  }

  console.log(`\n  Risultato: ${passed} ok, ${failed} falliti\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
