/**
 * Script di setup integrazione Manubot per Villa I Barronci
 *
 * Questo script:
 * 1. Si autentica su Manubot (Supabase di Manubot)
 * 2. Recupera il company_id reale di Villa I Barronci
 * 3. Genera un api_token univoco per il webhook receiver
 * 4. Salva tutto sulla property "villa-i-barronci" in HotelAccelerator Supabase
 *
 * Eseguire con: node scripts/setup-manubot-integration.mjs
 */

import crypto from "crypto"

// ─── Credenziali Manubot (Villa I Barronci) ────────────────────────────────
const MANUBOT_SUPABASE_URL = "https://qqcxeksvegvmgajmyqcz.supabase.co"
const MANUBOT_EMAIL        = "f.mancini@ibarronci.com"
const MANUBOT_PASSWORD     = "Pippolo75@manubot"
const MANUBOT_BASE_URL     = "https://manubot.it/api"

// ─── HotelAccelerator Supabase ────────────────────────────────────────────
const HA_SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const HA_SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY

// ─── 1. Login su Manubot ──────────────────────────────────────────────────
async function loginManubot() {
  console.log("1. Login su Manubot Supabase...")
  const res = await fetch(
    `${MANUBOT_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // anon key pubblica di Manubot Supabase
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxY3hla3N2ZWd2bWdham15cWN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAxNTM2MDAwMH0.placeholder",
      },
      body: JSON.stringify({ email: MANUBOT_EMAIL, password: MANUBOT_PASSWORD }),
    }
  )

  if (!res.ok) {
    const txt = await res.text()
    // Prova senza apikey (alcuni setup Supabase la ignorano)
    console.log("   Tentativo senza apikey fissa...")
    const res2 = await fetch(
      `${MANUBOT_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: MANUBOT_EMAIL, password: MANUBOT_PASSWORD }),
      }
    )
    if (!res2.ok) {
      throw new Error(`Login fallito: ${await res2.text()}`)
    }
    const data2 = await res2.json()
    console.log("   Login OK (senza apikey fissa)")
    return data2
  }

  const data = await res.json()
  console.log("   Login OK")
  return data
}

// ─── 2. Recupera company_id dal profilo utente ────────────────────────────
async function getCompanyId(accessToken, supabaseAnonKey) {
  console.log("2. Recupero company_id da profilo utente...")

  // Prima prova: profilo via Supabase REST
  const profileRes = await fetch(
    `${MANUBOT_SUPABASE_URL}/rest/v1/profiles?select=active_company_id,company_id&email=eq.${encodeURIComponent(MANUBOT_EMAIL)}&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey || accessToken,
        Accept: "application/json",
      },
    }
  )

  if (profileRes.ok) {
    const profiles = await profileRes.json()
    console.log("   Profili trovati:", JSON.stringify(profiles))
    if (profiles?.[0]) {
      const companyId = profiles[0].active_company_id || profiles[0].company_id
      if (companyId) {
        console.log(`   company_id: ${companyId}`)
        return companyId
      }
    }
  }

  // Seconda prova: API Manubot /companies
  console.log("   Provo /api/companies...")
  const companiesRes = await fetch(`${MANUBOT_BASE_URL}/companies`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  })

  if (companiesRes.ok) {
    const data = await companiesRes.json()
    const companies = Array.isArray(data) ? data : data.companies || data.data || []
    console.log(`   Aziende trovate: ${companies.length}`)
    if (companies.length > 0) {
      const company = companies.find(c =>
        c.name?.toLowerCase().includes("barronci") ||
        c.name?.toLowerCase().includes("villa")
      ) || companies[0]
      console.log(`   Company: ${company.name} (${company.id})`)
      return company.id
    }
  }

  // Terza prova: utente corrente
  console.log("   Provo /auth/v1/user...")
  const userRes = await fetch(`${MANUBOT_SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (userRes.ok) {
    const user = await userRes.json()
    console.log("   User metadata:", JSON.stringify(user.user_metadata))
    const companyId = user.user_metadata?.company_id || user.app_metadata?.company_id
    if (companyId) return companyId
  }

  throw new Error("Impossibile recuperare il company_id. Controllare manualmente su Manubot.")
}

// ─── 3. Salva configurazione su HotelAccelerator ──────────────────────────
async function saveToHotelAccelerator(companyId, apiToken) {
  console.log("3. Salvataggio configurazione su HotelAccelerator Supabase...")

  if (!HA_SUPABASE_URL || !HA_SUPABASE_KEY) {
    throw new Error("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non impostati come env var")
  }

  // Trova la property Villa I Barronci
  const findRes = await fetch(
    `${HA_SUPABASE_URL}/rest/v1/properties?slug=eq.villa-i-barronci&select=id,name,slug&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${HA_SUPABASE_KEY}`,
        apikey: HA_SUPABASE_KEY,
        Accept: "application/json",
      },
    }
  )

  let propertyId
  if (findRes.ok) {
    const props = await findRes.json()
    console.log("   Properties trovate:", JSON.stringify(props))
    propertyId = props?.[0]?.id
  }

  if (!propertyId) {
    // Prova con dev-property-id
    console.log("   Proprietà non trovata per slug 'villa-i-barronci', aggiorno dev-property-id...")
    propertyId = "dev-property-id"
  }

  // Aggiorna le colonne Manubot
  const updateRes = await fetch(
    `${HA_SUPABASE_URL}/rest/v1/properties?id=eq.${propertyId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${HA_SUPABASE_KEY}`,
        apikey: HA_SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        manubot_email:        MANUBOT_EMAIL,
        manubot_password:     MANUBOT_PASSWORD,
        manubot_supabase_url: MANUBOT_SUPABASE_URL,
        manubot_company_id:   companyId,
        api_token:            apiToken,
      }),
    }
  )

  if (!updateRes.ok) {
    const err = await updateRes.text()
    throw new Error(`Aggiornamento property fallito: ${err}`)
  }

  const updated = await updateRes.json()
  console.log("   Configurazione salvata per property:", updated?.[0]?.name || propertyId)
  return updated
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Setup Integrazione Manubot per Villa I Barronci ===\n")

  try {
    // Step 1: Login
    const authData = await loginManubot()
    const accessToken  = authData.access_token
    const refreshToken = authData.refresh_token

    // Step 2: company_id
    const supabaseAnonKey = authData.supabase_anon_key // se restituito
    const companyId = await getCompanyId(accessToken, supabaseAnonKey)

    // Step 3: Genera api_token univoco per webhook receiver
    const apiToken = crypto.randomBytes(32).toString("hex")
    console.log(`\n   api_token generato: ${apiToken}`)
    console.log("   (Questo token va inserito in Manubot: Dashboard → Impostazioni → Integrazioni → Bearer Token)\n")

    // Step 4: Salva su HotelAccelerator
    await saveToHotelAccelerator(companyId, apiToken)

    console.log("\n=== SETUP COMPLETATO ===")
    console.log(`company_id Manubot: ${companyId}`)
    console.log(`Webhook endpoint:   ${process.env.NEXT_PUBLIC_APP_URL || "https://[tuodominio]"}/api/external/manubot`)
    console.log(`Bearer token:       ${apiToken}`)
    console.log("\nConfigura questi dati in Manubot > Impostazioni > Integrazioni")

  } catch (err) {
    console.error("\n[ERRORE]", err.message)
    process.exit(1)
  }
}

main()
