/**
 * Censimento delle rotte che usano il RUOLO DI SERVIZIO.
 *
 * Perche' serve: `service_role` SCAVALCA le politiche RLS. Su quelle rotte
 * l'isolamento fra tenant non e' garantito dal database: va scritto NELLA
 * QUERY. Una politica perfetta non protegge nulla se la rotta la aggira.
 *
 * COSA CERCA (il rischio vero, non "usa il ruolo di servizio"):
 *   la rotta prende un IDENTIFICATIVO DALLA RICHIESTA e lo usa in una query
 *   senza verificare che appartenga al tenant di chi chiama.
 *
 * Non e' un misuratore di verita' assoluta: e' un SETACCIO che produce una
 * lista da leggere a mano. Per questo ha due controlli di validita' che
 * devono passare, altrimenti si ferma e non stampa numeri di cui fidarsi.
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

const rotte = execSync(
  `grep -rlE "SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|createServiceClient|createAdminClient|supabaseAdmin" app/api --include=route.ts`,
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)

// Percorsi che NON hanno un tenant di sessione per definizione.
const SENZA_SESSIONE = /\/api\/(webhooks?|cron|health|auth|public|embed|track|meta|stripe|twilio|whatsapp)\//

/** Chi dice qual e' il tenant di CHI CHIAMA (fonte fidata: la sessione). */
const DA_SESSIONE =
  /getAuthenticatedPropertyId|getAuthenticatedUser|getCallerIdentity|requireTenantAdmin|getPropertyFromSession|getCurrentProperty|requireSuperAdmin|getAuthenticatedUserEmail/

/**
 * Identificativi che arrivano DA FUORI (non fidati).
 * Comprende i parametri dinamici di percorso, che in Next.js 16 si leggono
 * con `const { contactId } = await params` — la forma piu' comune qui.
 */
const DA_RICHIESTA = new RegExp(
  [
    /searchParams\.get\(\s*["'][a-zA-Z_]*([Ii]d|ID)["']\s*\)/.source,
    /params\.[a-zA-Z]*[Ii]d\b/.source,
    /body\.[a-zA-Z]*[Ii]d\b/.source,
    // destrutturazione da params o da json()
    /\{[^}]*\b[a-zA-Z]+[Ii]d\b[^}]*\}\s*=\s*await\s+(params|request\.json\(\)|req\.json\(\))/.source,
  ].join("|"),
)

/** Filtro esplicito per tenant dentro la query. */
const FILTRA_TENANT = /\.eq\(\s*["']property_id["']|property_id\s*:\s*propertyId|\.in\(\s*["']property_id["']/

/** Verifica di appartenenza fatta a parte (aiutanti gia' esistenti). */
const VERIFICA_A_PARTE = /canAccessEmailChannel|getAccessibleChannelIds|assertTenantAccess|verifyTenantAccess|getChannelAccess/

const esiti = []
for (const f of rotte) {
  const testo = readFileSync(f, "utf8")
  const percorso = f.replace("app/api/", "").replace("/route.ts", "")

  const senzaSessione = SENZA_SESSIONE.test(f)
  const daSessione = DA_SESSIONE.test(testo)
  const daRichiesta = DA_RICHIESTA.test(testo)
  const filtra = FILTRA_TENANT.test(testo)
  const verificaAParte = VERIFICA_A_PARTE.test(testo)

  let classe
  if (senzaSessione) classe = "SENZA SESSIONE (da leggere a mano)"
  else if (!daSessione) classe = "NESSUN TENANT DI SESSIONE"
  else if (daRichiesta && !filtra && !verificaAParte) classe = "A RISCHIO: id esterno non verificato"
  else if (!filtra && !verificaAParte) classe = "da leggere: nessun filtro esplicito"
  else classe = "filtra per tenant"

  esiti.push({ percorso, classe, daSessione, daRichiesta, filtra, verificaAParte })
}

// ---------------------------------------------------------------------------
// CONTROLLI DI VALIDITA'. Senza questi i numeri non valgono nulla.
//
// Lezione pagata piu' volte: uno scanner che dice "tutto rosso" o "tutto
// verde" quasi sempre e' rotto. Verifico che sappia distinguere un caso NOTO
// sicuro da un caso NOTO a rischio.
// ---------------------------------------------------------------------------
const problemi = []

// Controllo POSITIVO: `crm/contacts/[contactId]` prende un identificativo da
// fuori E filtra per tenant. E' il caso ideale: se lo scanner lo chiamasse
// "a rischio" starebbe solo contando gli id esterni, non l'isolamento.
const positivo = esiti.find((e) => e.percorso === "admin/crm/contacts/[contactId]")
if (!positivo) problemi.push("controllo positivo assente: admin/crm/contacts/[contactId] non trovata")
else if (!positivo.daRichiesta)
  problemi.push("controllo positivo cieco: non riconosce l'id esterno di admin/crm/contacts/[contactId]")
else if (positivo.classe.startsWith("A RISCHIO"))
  problemi.push(`controllo positivo fallito: ${positivo.percorso} classificata a rischio pur filtrando`)

// Controllo NEGATIVO: un file inventato, palesemente a rischio, DEVE essere
// riconosciuto. Se lo scanner lo dichiara sicuro, non sta misurando nulla.
const finto = `
  import { createServiceClient } from "@/lib/supabase/service"
  import { getAuthenticatedPropertyId } from "@/lib/auth-property"
  export async function GET(request) {
    const propertyId = await getAuthenticatedPropertyId(request)
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get("conversationId")
    const db = createServiceClient()
    return db.from("messages").select("*").eq("conversation_id", conversationId)
  }`
const fintoRischio =
  DA_SESSIONE.test(finto) && DA_RICHIESTA.test(finto) && !FILTRA_TENANT.test(finto) && !VERIFICA_A_PARTE.test(finto)
if (!fintoRischio) problemi.push("controllo negativo fallito: un caso palesemente a rischio non viene riconosciuto")

if (problemi.length) {
  console.log("SCANNER NON AFFIDABILE, mi fermo:")
  for (const p of problemi) console.log("  - " + p)
  process.exit(1)
}

const perClasse = {}
for (const e of esiti) (perClasse[e.classe] ??= []).push(e.percorso)

console.log(`Rotte che usano il ruolo di servizio: ${esiti.length}\n`)
for (const [classe, lista] of Object.entries(perClasse).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${classe}  (${lista.length})`)
  for (const p of lista.sort()) console.log(`    ${p}`)
  console.log("")
}
console.log("Controlli di validita': positivo OK, negativo OK.")
