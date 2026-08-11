#!/usr/bin/env node
/**
 * Censimento delle rotte API: quali hanno un presidio e quali no.
 *
 * NON dichiara "falle": classifica soltanto, perche' molte rotte senza sessione
 * sono legittimamente pubbliche (webhook firmati, health, callback OAuth) e
 * altre sono protette da presidi DIVERSI da quello che uno si aspetta.
 * Errore gia' commesso: cercare `requireTenantAdmin` in `admin/cleanup`, che e'
 * invece protetta da `assertBootstrapWindow`. Cercare UN solo presidio produce
 * falsi allarmi.
 *
 * Uso: node scripts/classify-api-routes.mjs [--gruppo <nome>]
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const RADICE = "app/api"

// Tutti i presidi realmente usati nel progetto, non solo quello atteso.
// Ricavati dalle funzioni realmente ESPORTATE da lib/, non dalla memoria:
// il primo elenco ometteva `getAuthenticatedPropertyId`, che e' il presidio
// PIU' USATO del progetto, e gonfiava il gruppo "da guardare".
const PRESIDI = [
  "requireTenantAdmin",
  "requireSuperAdmin",
  "requireAreaApi",
  "requireAdminPage",
  "assertBootstrapWindow",
  "assertTenantAccess",
  "canAccessEmailChannel",
  "getAuthenticatedPropertyIdWithSuperAdminOverride",
  "getAuthenticatedPropertyId",
  "getAuthenticatedUserEmail",
  "getAuthenticatedUser",
  "getCallerIdentity",
  "getPropertyFromSession",
  "getCurrentProperty",
  "getCurrentTenant",
  "getCurrentUser",
  "getChannelAccess",
  "getAccessibleChannelIds",
]

// Segnali che una rotta e' pubblica PER PROGETTO (non per dimenticanza).
const SEGNALI_PUBBLICI = [
  { chiave: "CRON_SECRET", motivo: "cron con segreto condiviso" },
  { chiave: "verifyWebhookSignature", motivo: "webhook con firma verificata" },
  { chiave: "stripe.webhooks.constructEvent", motivo: "webhook Stripe firmato" },
  { chiave: "META_WEBHOOK_VERIFY_TOKEN", motivo: "webhook Meta con token" },
  { chiave: "x-api-key", motivo: "chiave API per integrazioni esterne" },
  { chiave: "platform_api_keys", motivo: "chiave API di piattaforma" },
  { chiave: "api_token", motivo: "token applicativo" },
  { chiave: "exchangeCodeForSession", motivo: "callback OAuth" },
]

function raccogliRotte(dir, acc = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce)
    if (statSync(p).isDirectory()) raccogliRotte(p, acc)
    else if (voce === "route.ts" || voce === "route.tsx") acc.push(p)
  }
  return acc
}

const rotte = raccogliRotte(RADICE)
const gruppi = { presidiata: [], pubblicaPerProgetto: [], daGuardare: [] }

for (const file of rotte) {
  const src = readFileSync(file, "utf8")
  const percorso = "/" + relative("app", file).replace(/\/route\.tsx?$/, "")

  const presidiTrovati = PRESIDI.filter((g) => new RegExp(`\\b${g}\\s*\\(`).test(src))
  const segnale = SEGNALI_PUBBLICI.find((s) => src.includes(s.chiave))

  // Usa la chiave di servizio? (scavalca RLS: l'isolamento va scritto a mano)
  const servizio = /SUPABASE_SERVICE_ROLE_KEY|createServiceClient|SUPABASE_SECRET_KEY/.test(src)

  // Prende un identificativo da FUORI? (il caso piu' rischioso)
  const idEsterno =
    /params\s*[:.]|await\s+params|searchParams\.get\(\s*["'](property_id|propertyId|id|companyId)/.test(src) ||
    /body\.(propertyId|property_id|companyId|channelId|photoId)/.test(src)

  const riga = { percorso, presidi: presidiTrovati, servizio, idEsterno, segnale: segnale?.motivo }

  if (presidiTrovati.length) gruppi.presidiata.push(riga)
  else if (segnale) gruppi.pubblicaPerProgetto.push(riga)
  else gruppi.daGuardare.push(riga)
}

// ── VALIDAZIONE DEL CENSIMENTO ─────────────────────────────────────────────
// Senza questi due controlli non saprei distinguere un censimento che funziona
// da uno che sbaglia in blocco. Dopo la correzione dell'elenco presidi il
// rischio opposto e' lo ZERO FALSO: tutto classificato come presidiato.
const CONTROLLO_POSITIVO = "/api/admin/manubot/setup" // presidiata: appena corretta
// Rotta REALE e volutamente senza presidio di sessione (widget pubblico).
// Prima avevo scritto "/api/health", che NON esiste: il controllo l'ha
// intercettato subito — stessa trappola della pagina inventata "/galleria".
const CONTROLLO_NEGATIVO = "/api/public/embed/[scriptId]/config"

const posOk = gruppi.presidiata.some((r) => r.percorso === CONTROLLO_POSITIVO)
const negTrovata = rotte.some((f) => ("/" + relative("app", f).replace(/\/route\.tsx?$/, "")) === CONTROLLO_NEGATIVO)
const negOk = !negTrovata || !gruppi.presidiata.some((r) => r.percorso === CONTROLLO_NEGATIVO)

if (!posOk) {
  console.error(`\nCENSIMENTO NON VALIDO: ${CONTROLLO_POSITIVO} risulta senza presidio, ma ne ha uno.`)
  process.exit(1)
}
if (!negTrovata) {
  console.error(`\nCENSIMENTO NON VALIDO: il controllo negativo ${CONTROLLO_NEGATIVO} non esiste.`)
  process.exit(1)
}
if (!negOk) {
  console.error(`\nCENSIMENTO NON VALIDO: ${CONTROLLO_NEGATIVO} risulta presidiata: l'espressione riconosce troppo.`)
  process.exit(1)
}

const filtro = process.argv.includes("--gruppo")
  ? process.argv[process.argv.indexOf("--gruppo") + 1]
  : null

console.log(`\nRotte totali: ${rotte.length}`)
console.log(`  presidiate:             ${gruppi.presidiata.length}`)
console.log(`  pubbliche per progetto: ${gruppi.pubblicaPerProgetto.length}`)
console.log(`  DA GUARDARE una per una:${gruppi.daGuardare.length}`)

// Le piu' urgenti: nessun presidio + chiave di servizio + id da fuori.
const urgenti = gruppi.daGuardare.filter((r) => r.servizio && r.idEsterno)
console.log(`\n  di cui URGENTI (servizio + id esterno): ${urgenti.length}`)

function stampa(titolo, righe) {
  console.log(`\n─── ${titolo} (${righe.length}) ───`)
  for (const r of righe) {
    const note = [
      r.servizio ? "servizio" : null,
      r.idEsterno ? "id-esterno" : null,
      r.segnale,
      r.presidi.length ? r.presidi.join("+") : null,
    ]
      .filter(Boolean)
      .join(", ")
    console.log(`  ${r.percorso}${note ? `  [${note}]` : ""}`)
  }
}

if (filtro === "urgenti") stampa("URGENTI", urgenti)
else if (filtro === "daguardare") stampa("DA GUARDARE", gruppi.daGuardare)
else if (filtro === "pubbliche") stampa("PUBBLICHE PER PROGETTO", gruppi.pubblicaPerProgetto)
else if (filtro === "presidiate") stampa("PRESIDIATE", gruppi.presidiata)
else stampa("URGENTI — da esaminare per prime", urgenti)

console.log(
  "\nNota: questo censimento CLASSIFICA, non accusa. Ogni voce va letta prima\n" +
    "di dichiararla una falla: presidi diversi da quelli attesi esistono.\n",
)
