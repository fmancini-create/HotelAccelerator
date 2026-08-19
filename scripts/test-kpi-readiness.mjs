/**
 * Contratto di `evaluateKpiReadiness`.
 *
 * I casi sono scritti per IDENTITA' (ingresso -> esito atteso dichiarato a mano),
 * non richiamando la logica della funzione: un test che ricalcola la regola
 * passerebbe anche se la regola fosse sbagliata.
 *
 * Il caso che conta e' l'ultimo: prima della correzione un segnalibro vecchio di
 * mesi dava "pronto", e il KPI pubblicava un numero non piu' allineato a Gmail.
 */
import { evaluateKpiReadiness, RECONCILE_STALE_AFTER_MS } from "../lib/email/kpi-readiness.ts"

const ORA = Date.parse("2026-08-17T12:00:00.000Z")
const minutiFa = (m) => new Date(ORA - m * 60000).toISOString()

const casi = [
  {
    nome: "tutte riconciliate poco fa -> pubblica",
    canali: [{ gmail_state_reconciled_at: minutiFa(10) }, { gmail_state_reconciled_at: minutiFa(65) }],
    atteso: { status: "gmail_state_ready", ready: true },
  },
  {
    nome: "una casella non ha MAI riconciliato -> prima passata",
    canali: [{ gmail_state_reconciled_at: minutiFa(10) }, { gmail_state_reconciled_at: null }],
    atteso: { status: "reconciling", ready: false, neverReconciled: 1 },
  },
  {
    nome: "nessuna casella -> non pubblica (niente su cui fondarsi)",
    canali: [],
    atteso: { status: "reconciling", ready: false },
  },
  {
    nome: "casella revocata NON blocca le altre",
    canali: [
      { gmail_state_reconciled_at: minutiFa(10) },
      { gmail_state_reconciled_at: null, oauth_reconnect_required: true },
    ],
    atteso: { status: "gmail_state_ready", ready: true, neverReconciled: 0 },
  },
  {
    nome: "data illeggibile vale come mai riconciliata",
    canali: [{ gmail_state_reconciled_at: "non-una-data" }],
    atteso: { status: "reconciling", ready: false, neverReconciled: 1 },
  },
  {
    nome: "appena SOTTO la soglia -> ancora pubblicabile",
    canali: [{ gmail_state_reconciled_at: new Date(ORA - RECONCILE_STALE_AFTER_MS + 60000).toISOString() }],
    atteso: { status: "gmail_state_ready", ready: true, staleReconciled: 0 },
  },
  {
    nome: "appena SOPRA la soglia -> in ritardo",
    canali: [{ gmail_state_reconciled_at: new Date(ORA - RECONCILE_STALE_AFTER_MS - 60000).toISOString() }],
    atteso: { status: "stale", ready: false, staleReconciled: 1 },
  },
  {
    nome: "IL DIFETTO: riconciliata mesi fa -> prima diceva pronto",
    canali: [{ gmail_state_reconciled_at: minutiFa(60 * 24 * 90) }],
    atteso: { status: "stale", ready: false, staleReconciled: 1, oldestReconcileAgeMinutes: 60 * 24 * 90 },
  },
]

let passati = 0
let falliti = 0

for (const c of casi) {
  const esito = evaluateKpiReadiness(c.canali, ORA)
  const errori = []
  for (const [campo, atteso] of Object.entries(c.atteso)) {
    if (esito[campo] !== atteso) errori.push(`${campo}: atteso ${atteso}, ottenuto ${esito[campo]}`)
  }
  if (errori.length === 0) {
    passati += 1
    console.log(`PASS  ${c.nome}`)
  } else {
    falliti += 1
    console.log(`FAIL  ${c.nome}`)
    for (const e of errori) console.log(`        ${e}`)
  }
}

// Controllo che il test sia capace di FALLIRE: senza questo un confronto rotto
// (per esempio un campo scritto male) darebbe "tutto verde" senza provare nulla.
const sabotaggio = evaluateKpiReadiness([{ gmail_state_reconciled_at: minutiFa(60 * 24 * 90) }], ORA)
if (sabotaggio.ready === true) {
  console.log("\nFAIL  controllo di sanita': un segnalibro di 90 giorni risulta pronto")
  falliti += 1
} else {
  console.log("\nPASS  controllo di sanita': il test distingue davvero pronto da in ritardo")
  passati += 1
}

console.log(`\nPassati: ${passati}  Falliti: ${falliti}`)
process.exit(falliti === 0 ? 0 : 1)
