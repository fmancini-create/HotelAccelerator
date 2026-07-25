/**
 * TEMPLATE — Setup integrazione Manubot per una property.
 *
 * Questo file sostituisce il precedente `setup-manubot-integration.mjs`,
 * rimosso perche' conteneva credenziali reali hardcoded.
 * Vedi docs/SECURITY_SECRET_ROTATION_NOTES.md.
 *
 * REGOLA: nessun valore reale in questo file. Mai.
 * Tutti i valori arrivano da variabili d'ambiente o da argomenti CLI.
 *
 * Cosa fa lo script:
 *   1. si autentica sul Supabase di Manubot (grant_type=password)
 *   2. risolve il company_id dell'azienda su Manubot
 *   3. genera un api_token casuale per il webhook receiver dell'hub
 *   4. salva email / password / supabase_url / company_id / api_token
 *      sulla property indicata in HotelAccelerator
 *
 * Esecuzione (le env NON vanno mai scritte inline nella history della shell:
 * usare un file .env locale non tracciato):
 *
 *   node --env-file-if-exists=.env.local scripts/setup-manubot-integration.example.mjs
 *
 * Env richieste:
 *   MANUBOT_SUPABASE_URL        URL Supabase dell'istanza Manubot
 *   MANUBOT_SUPABASE_ANON_KEY   anon key di quel Supabase
 *   MANUBOT_EMAIL               account Manubot della struttura
 *   MANUBOT_PASSWORD            password di quell'account
 *   MANUBOT_BASE_URL            base URL API Manubot (opzionale)
 *   PROPERTY_ID                 id della property su HotelAccelerator
 *   COMPANY_ID                  opzionale: forza il company_id e salta la risoluzione
 *   SUPABASE_URL                Supabase di HotelAccelerator
 *   SUPABASE_SERVICE_ROLE_KEY   service role di HotelAccelerator
 *
 * NOTA SICUREZZA: la colonna `manubot_password` va scritta cifrata
 * (`lib/manubot/credential-secrets.ts`, prefisso `enc:v1:`). Questo template
 * scrive il valore cosi' com'e' ricevuto: usarlo solo in ambienti dove la
 * cifratura at-rest e' gestita a valle, oppure adattarlo prima dell'uso.
 */

import crypto from "crypto"

// ─── Config: SOLO da environment, nessun default reale ────────────────────
const MANUBOT_SUPABASE_URL = process.env.MANUBOT_SUPABASE_URL
const MANUBOT_SUPABASE_ANON_KEY = process.env.MANUBOT_SUPABASE_ANON_KEY
const MANUBOT_EMAIL = process.env.MANUBOT_EMAIL
const MANUBOT_PASSWORD = process.env.MANUBOT_PASSWORD
const MANUBOT_BASE_URL = process.env.MANUBOT_BASE_URL
const PROPERTY_ID = process.env.PROPERTY_ID
const FORCED_COMPANY_ID = process.env.COMPANY_ID

const HA_SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const HA_SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Fallisce subito se manca una env, senza mai stamparne il valore. */
function requireEnv() {
  const missing = [
    ["MANUBOT_SUPABASE_URL", MANUBOT_SUPABASE_URL],
    ["MANUBOT_EMAIL", MANUBOT_EMAIL],
    ["MANUBOT_PASSWORD", MANUBOT_PASSWORD],
    ["PROPERTY_ID", PROPERTY_ID],
    ["SUPABASE_URL", HA_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", HA_SUPABASE_KEY],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    console.error(`[setup] Env mancanti: ${missing.join(", ")}`)
    process.exit(1)
  }
}

// ─── 1. Login su Manubot ──────────────────────────────────────────────────
async function loginManubot() {
  console.log("1. Login su Manubot...")

  const headers = { "Content-Type": "application/json" }
  if (MANUBOT_SUPABASE_ANON_KEY) headers.apikey = MANUBOT_SUPABASE_ANON_KEY

  const res = await fetch(`${MANUBOT_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: MANUBOT_EMAIL, password: MANUBOT_PASSWORD }),
  })

  // Non stampare mai il corpo della risposta: puo' contenere token.
  if (!res.ok) {
    console.error(`[setup] Login fallito (HTTP ${res.status})`)
    process.exit(1)
  }

  console.log("   Login OK")
  return res.json()
}

// ─── 2. Risoluzione company_id ────────────────────────────────────────────
async function getCompanyId(accessToken) {
  if (FORCED_COMPANY_ID) {
    console.log("2. company_id forzato da env, risoluzione saltata")
    return FORCED_COMPANY_ID
  }

  console.log("2. Risoluzione company_id...")

  const profileRes = await fetch(
    `${MANUBOT_SUPABASE_URL}/rest/v1/profiles` +
      `?select=active_company_id,company_id&email=eq.${encodeURIComponent(MANUBOT_EMAIL)}&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: MANUBOT_SUPABASE_ANON_KEY || accessToken,
        Accept: "application/json",
      },
    },
  )

  if (profileRes.ok) {
    const profiles = await profileRes.json()
    const companyId = profiles?.[0]?.active_company_id || profiles?.[0]?.company_id
    if (companyId) {
      console.log("   company_id risolto dal profilo")
      return companyId
    }
  }

  if (MANUBOT_BASE_URL) {
    const companiesRes = await fetch(`${MANUBOT_BASE_URL}/companies`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    })
    if (companiesRes.ok) {
      const data = await companiesRes.json()
      const companies = Array.isArray(data) ? data : data.companies || data.data || []
      if (companies.length === 1) {
        console.log("   company_id risolto da /companies")
        return companies[0].id
      }
      if (companies.length > 1) {
        // Nessuna euristica sui nomi: ambiguo = si ferma e chiede COMPANY_ID.
        console.error("[setup] Piu' aziende disponibili: impostare COMPANY_ID e rieseguire")
        process.exit(1)
      }
    }
  }

  console.error("[setup] company_id non risolto: impostare COMPANY_ID e rieseguire")
  process.exit(1)
}

// ─── 3. Salvataggio su HotelAccelerator ───────────────────────────────────
async function saveToHotelAccelerator(companyId, apiToken) {
  console.log("3. Salvataggio sulla property...")

  const res = await fetch(`${HA_SUPABASE_URL}/rest/v1/properties?id=eq.${PROPERTY_ID}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${HA_SUPABASE_KEY}`,
      apikey: HA_SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      manubot_email: MANUBOT_EMAIL,
      manubot_password: MANUBOT_PASSWORD,
      manubot_supabase_url: MANUBOT_SUPABASE_URL,
      manubot_company_id: companyId,
      api_token: apiToken,
    }),
  })

  if (!res.ok) {
    console.error(`[setup] Aggiornamento property fallito (HTTP ${res.status})`)
    process.exit(1)
  }

  const updated = await res.json()
  if (!updated?.[0]) {
    console.error("[setup] Nessuna property aggiornata: PROPERTY_ID inesistente?")
    process.exit(1)
  }

  console.log("   Configurazione salvata")
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
  requireEnv()

  const authData = await loginManubot()
  const companyId = await getCompanyId(authData.access_token)

  // api_token per il webhook receiver: generato qui, mostrato UNA volta.
  const apiToken = crypto.randomBytes(32).toString("hex")

  await saveToHotelAccelerator(companyId, apiToken)

  console.log("\n=== SETUP COMPLETATO ===")
  console.log(`company_id: ${companyId}`)
  console.log(`webhook:    ${process.env.NEXT_PUBLIC_APP_URL || "https://<dominio-hub>"}/api/external/manubot`)
  console.log("\nIl bearer token generato va incollato in Manubot > Impostazioni > Integrazioni.")
  console.log("Viene mostrato solo ora e non deve essere committato:")
  console.log(apiToken)
}

main().catch((err) => {
  // Solo il messaggio, mai l'oggetto completo: potrebbe contenere header con token.
  console.error("[setup] Errore:", err?.message ?? "sconosciuto")
  process.exit(1)
})
