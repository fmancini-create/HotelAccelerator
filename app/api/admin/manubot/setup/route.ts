/**
 * API Route temporanea per setup integrazione Manubot
 * GET /api/admin/manubot/setup
 *
 * 1. Autentica su Manubot Supabase
 * 2. Recupera il company_id reale di Villa I Barronci
 * 3. Genera api_token per webhook receiver
 * 4. Salva tutto su HotelAccelerator Supabase
 *
 * Da chiamare UNA VOLTA dal browser in ambiente dev/preview.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import crypto from "crypto"

/**
 * Legge una variabile ambiente obbligatoria.
 * Lancia un errore controllato (senza esporre il valore) se mancante.
 */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Configurazione Manubot mancante: variabile ambiente ${name} non impostata`)
  }
  return value
}

export async function GET(req: NextRequest) {
  const log: string[] = []

  try {
    // SECURITY: gate di accesso con autenticazione reale (admin tenant o
    // super-admin). Sostituisce il vecchio bypass host-based pubblico: su
    // preview pubbliche e produzione l'endpoint richiede sempre auth reale,
    // mentre in sviluppo locale resta consentito tramite il dev bypass sicuro
    // (NODE_ENV=development + localhost/127.0.0.1) ereditato da requireTenantAdmin.
    await requireTenantAdmin(req)
    // Credenziali Manubot da variabili ambiente (nessun valore hardcoded).
    // Se mancano, requireEnv lancia un errore controllato gestito dal catch.
    const MANUBOT_SUPABASE_URL = requireEnv("MANUBOT_SUPABASE_URL")
    const MANUBOT_ANON_KEY     = requireEnv("MANUBOT_SUPABASE_ANON_KEY")
    const MANUBOT_EMAIL        = requireEnv("MANUBOT_DEFAULT_EMAIL")
    const MANUBOT_PASSWORD     = requireEnv("MANUBOT_DEFAULT_PASSWORD")
    const MANUBOT_BASE_URL     = requireEnv("MANUBOT_BASE_URL")

    // ── Step 1: Login su Manubot ─────────────────────────────────────────
    log.push("1. Login su Manubot Supabase...")
    const loginRes = await fetch(
      `${MANUBOT_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": MANUBOT_ANON_KEY,
        },
        body: JSON.stringify({ email: MANUBOT_EMAIL, password: MANUBOT_PASSWORD }),
      }
    )
    if (!loginRes.ok) {
      const err = await loginRes.text()
      return NextResponse.json({ error: `Login Manubot fallito: ${err}`, log }, { status: 500 })
    }

    const authData = await loginRes.json()
    const accessToken = authData.access_token
    log.push(`   Login OK — token ottenuto (scade: ${new Date((authData.expires_at || Date.now() / 1000 + 3600) * 1000).toISOString()})`)

    // ── Step 2: Recupera company_id ───────────────────────────────────────
    log.push("2. Recupero company_id...")
    let companyId: string | null = null

    // Tenta dal profilo utente in Supabase di Manubot
    const profileRes = await fetch(
      `${MANUBOT_SUPABASE_URL}/rest/v1/profiles?select=active_company_id,company_id&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: accessToken,
          Accept: "application/json",
        },
      }
    )
    if (profileRes.ok) {
      const profiles = await profileRes.json()
      log.push(`   Profiles raw: ${JSON.stringify(profiles)}`)
      companyId = profiles?.[0]?.active_company_id || profiles?.[0]?.company_id || null
    }

    // Tenta da /user metadata
    if (!companyId) {
      const userRes = await fetch(`${MANUBOT_SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (userRes.ok) {
        const user = await userRes.json()
        log.push(`   User metadata: ${JSON.stringify(user.user_metadata)}`)
        log.push(`   App metadata: ${JSON.stringify(user.app_metadata)}`)
        companyId =
          user.user_metadata?.company_id ||
          user.user_metadata?.active_company_id ||
          user.app_metadata?.company_id ||
          null
      }
    }

    // Tenta da API Manubot /companies
    if (!companyId) {
      const companiesRes = await fetch(`${MANUBOT_BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      log.push(`   /companies status: ${companiesRes.status}`)
      if (companiesRes.ok) {
        const data = await companiesRes.json()
        log.push(`   /companies raw: ${JSON.stringify(data).slice(0, 300)}`)
        const list = Array.isArray(data) ? data : data.companies || data.data || []
        const match = list.find((c: any) =>
          c.name?.toLowerCase().includes("barronci") ||
          c.name?.toLowerCase().includes("villa")
        ) || list[0]
        companyId = match?.id || null
        if (companyId) log.push(`   company trovato: ${match?.name} (${companyId})`)
      }
    }

    if (!companyId) {
      return NextResponse.json({
        error: "company_id non trovato automaticamente. Vedi 'log' per debug.",
        log,
        suggestion: "Controlla manualmente il profilo su Manubot e incolla il company_id",
      }, { status: 422 })
    }
    log.push(`   company_id: ${companyId}`)

    // ── Step 3: Genera api_token per webhook receiver ─────────────────────
    const apiToken = crypto.randomBytes(32).toString("hex")
    log.push("3. api_token generato (valore non loggato per sicurezza)")

    // ── Step 4: Salva su HotelAccelerator Supabase ────────────────────────
    log.push("4. Salvataggio su HotelAccelerator Supabase...")
    const supabase = createServiceClient()

    // Trova la property (prova per slug, poi per ID dev)
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, slug")
      .or("slug.eq.villa-i-barronci,id.eq.c16ad260-2c34-4544-9909-5cd444773986")
      .limit(1)

    log.push(`   Properties trovate: ${JSON.stringify(properties)}`)
    const property = properties?.[0]

    if (!property) {
      return NextResponse.json({
        error: "Property 'villa-i-barronci' non trovata su HotelAccelerator",
        log,
      }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from("properties")
      .update({
        manubot_email:        MANUBOT_EMAIL,
        manubot_password:     MANUBOT_PASSWORD,
        manubot_supabase_url: MANUBOT_SUPABASE_URL,
        manubot_company_id:   companyId,
        api_token:            apiToken,
      })
      .eq("id", property.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message, log }, { status: 500 })
    }

    log.push(`   Salvato su property: ${property.name || property.id}`)

    return NextResponse.json({
      success: true,
      property_id: property.id,
      property_name: property.name,
      manubot_company_id: companyId,
      api_token: apiToken,
      webhook_endpoint: `${process.env.NEXT_PUBLIC_APP_URL}/api/external/manubot`,
      instructions: [
        "Vai su Manubot → Dashboard → Impostazioni → Integrazioni",
        `Inserisci l'endpoint: ${process.env.NEXT_PUBLIC_APP_URL}/api/external/manubot`,
        `Inserisci il Bearer Token: ${apiToken}`,
        "Seleziona gli eventi: task.created, task.updated, task.completed",
      ],
      log,
    })

  } catch (err: any) {
    // Le negazioni di accesso (401/403) non sono errori server: mappale al
    // codice corretto senza includere il log di debug.
    if (isAccessError(err)) {
      return NextResponse.json({ error: err.message }, { status: accessErrorStatus(err) })
    }
    return NextResponse.json({ error: err.message, log }, { status: 500 })
  }
}
